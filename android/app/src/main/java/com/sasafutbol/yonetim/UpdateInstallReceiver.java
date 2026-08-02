package com.sasafutbol.yonetim;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.widget.Toast;

public class UpdateInstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(
                PackageInstaller.EXTRA_STATUS,
                PackageInstaller.STATUS_FAILURE);

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirmationIntent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                confirmationIntent = intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
            } else {
                confirmationIntent = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            }
            if (confirmationIntent != null) {
                confirmationIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(confirmationIntent);
            }
            return;
        }

        if (status == PackageInstaller.STATUS_SUCCESS) {
            Intent launchIntent = context.getPackageManager()
                    .getLaunchIntentForPackage(context.getPackageName());
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                try {
                    context.startActivity(launchIntent);
                } catch (Exception ignored) {
                    // Bazı Android sürümleri arka plandan otomatik açılışı engelleyebilir.
                }
            }
            return;
        }

        String errorMessage = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        Toast.makeText(
                context,
                errorMessage == null ? "SASA-F güncellemesi kurulamadı." : errorMessage,
                Toast.LENGTH_LONG).show();
    }
}
