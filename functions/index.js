const { onValueCreated } = require("firebase-functions/v2/database");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");

// Initialize Firebase Admin SDK
initializeApp();

/**
 * Triggers when a new public request is created at /requests/{requestId}.
 * Fetches all registered admin FCM tokens and dispatches a push notification.
 */
exports.sendRequestNotification = onValueCreated("/requests/{requestId}", async (event) => {
  const requestData = event.data.val();
  if (!requestData) {
    console.log("[FCM] Event data is empty. Skipping.");
    return null;
  }

  const requestType = requestData.type === "new-cemetery" ? "New Cemetery Request" : "Grave Correction Request";
  const requestDetail = requestData.type === "new-cemetery"
    ? `Cemetery: ${requestData.name || "Unknown"} in ${requestData.city || "Unknown"}`
    : `Grave: ${requestData.graveName || "Unknown"} (Issue: ${requestData.issue || "Other"})`;

  console.log(`[FCM] New request created [${event.params.requestId}]. Fetching admin tokens...`);

  const db = getDatabase();
  const tokensSnap = await db.ref("fcmTokens").once("value");
  if (!tokensSnap.exists()) {
    console.log("[FCM] No admin tokens registered under /fcmTokens.");
    return null;
  }

  // Gather unique active tokens
  const tokens = [];
  const tokenKeys = {}; // maps token to database key for potential cleanup
  
  tokensSnap.forEach((child) => {
    const val = child.val();
    if (val && val.token) {
      tokens.push(val.token);
      tokenKeys[val.token] = child.key;
    }
  });

  if (tokens.length === 0) {
    console.log("[FCM] Admin token array is empty.");
    return null;
  }

  const payload = {
    notification: {
      title: `🚨 ${requestType}`,
      body: `${requestDetail}\nSubmitted by: ${requestData.submitter || "Anonymous"}`
    },
    data: {
      url: "https://gravemap143.web.app/#admin" // redirects click to admin dashboard view
    }
  };

  const messaging = getMessaging();
  try {
    const response = await messaging.sendEachForMulticast({
      tokens: tokens,
      notification: payload.notification,
      data: payload.data
    });
    
    console.log(`[FCM] Multi-cast sent to ${tokens.length} tokens. Success: ${response.successCount}, Failure: ${response.failureCount}`);

    // If any tokens failed, clean up expired/invalid tokens from the database
    if (response.failureCount > 0) {
      const cleanups = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === "messaging/invalid-registration-token" ||
            errorCode === "messaging/registration-token-not-registered"
          ) {
            const badToken = tokens[idx];
            const dbKey = tokenKeys[badToken];
            if (dbKey) {
              console.log(`[FCM] Cleaning up invalid token for UID: ${dbKey}`);
              cleanups.push(db.ref(`fcmTokens/${dbKey}`).remove());
            }
          }
        }
      });
      
      if (cleanups.length > 0) {
        await Promise.all(cleanups);
        console.log(`[FCM] Successfully cleaned up ${cleanups.length} dead tokens.`);
      }
    }
  } catch (error) {
    console.error("[FCM] Error sending multicast notifications:", error);
  }

  return null;
});
