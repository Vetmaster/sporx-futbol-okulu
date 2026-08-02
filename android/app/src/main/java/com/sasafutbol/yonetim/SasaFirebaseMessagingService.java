package com.sasafutbol.yonetim;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class SasaFirebaseMessagingService extends FirebaseMessagingService {
    static final String CHANNEL_ID = "sasa_f_notifications";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        FcmTokenStore.save(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);

        RemoteMessage.Notification notification = message.getNotification();
        String title = notification != null ? notification.getTitle() : null;
        String body = notification != null ? notification.getBody() : null;
        if (title == null || title.isEmpty()) title = message.getData().get("title");
        if (body == null || body.isEmpty()) body = message.getData().get("body");
        if (title == null || title.isEmpty()) title = "SASA-F";
        if (body == null) body = "Yeni bir bildiriminiz var.";

        createNotificationChannel();
        Intent intent = new Intent(this, LauncherActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("openNotifications", true);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification_status)
                .setColor(Color.rgb(227, 27, 21))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManagerCompat.from(this)
                .notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "SASA-F Bildirimleri",
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("SASA-F Futbol Okulu bildirimleri");
        channel.enableVibration(true);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }
}
