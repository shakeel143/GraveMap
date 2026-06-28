// firebase-messaging-sw.js
// GraveMap — FCM Background Notification Handler
// This file MUST be at the root of the domain for FCM to work.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDzaFYCBCiJ1ThCSRfxBNIbnQp0vyvuFD4",
  authDomain: "gravemap143.firebaseapp.com",
  databaseURL: "https://gravemap143-default-rtdb.firebaseio.com",
  projectId: "gravemap143",
  storageBucket: "gravemap143.firebasestorage.app",
  messagingSenderId: "1018929725781",
  appId: "1:1018929725781:web:a4268b71da2774384d2fdc"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages (when app is not in foreground)
messaging.onBackgroundMessage(payload => {
  console.log('[FCM SW] Background message received:', payload);

  const { title, body, icon } = payload.notification || {};
  const notificationTitle = title || 'GraveMap';
  const notificationOptions = {
    body: body || 'You have a new notification.',
    icon: icon || '/favicon.png',
    badge: '/favicon.png',
    tag: 'gravemap-notification',
    data: payload.data || {},
    actions: [
      { action: 'view', title: 'View', icon: '/favicon.png' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
