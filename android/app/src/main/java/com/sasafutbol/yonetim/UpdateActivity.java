package com.sasafutbol.yonetim;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class UpdateActivity extends Activity {
    private static final String UPDATE_SCHEME = "sasaf";
    private static final String UPDATE_HOST = "update";
    private static final String UPDATE_ACTION = "com.sasafutbol.yonetim.UPDATE_INSTALL_STATUS";

    private TextView statusText;
    private ProgressBar progressBar;
    private File downloadedApk;
    private boolean downloadStarted;
    private boolean waitingForInstallPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUpdateScreen();

        String apkUrl = readAndValidateApkUrl(getIntent());
        if (apkUrl == null) {
            showFailure("Güncelleme adresi doğrulanamadı.");
            return;
        }

        downloadUpdate(apkUrl);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (waitingForInstallPermission && canInstallPackages()) {
            waitingForInstallPermission = false;
            installDownloadedUpdate();
        }
    }

    private void buildUpdateScreen() {
        int padding = Math.round(28 * getResources().getDisplayMetrics().density);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setPadding(padding, padding, padding, padding);
        root.setBackgroundColor(Color.rgb(247, 247, 247));

        TextView title = new TextView(this);
        title.setText("SASA-F güncelleniyor");
        title.setTextColor(Color.rgb(42, 42, 42));
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);

        statusText = new TextView(this);
        statusText.setText("Yeni sürüm indiriliyor…");
        statusText.setTextColor(Color.rgb(76, 76, 76));
        statusText.setTextSize(16);
        statusText.setGravity(Gravity.CENTER);
        statusText.setPadding(0, padding / 2, 0, padding / 2);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(true);
        progressBar.setMax(100);

        root.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(statusText, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(progressBar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);
    }

    private String readAndValidateApkUrl(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null
                || !UPDATE_SCHEME.equals(data.getScheme())
                || !UPDATE_HOST.equals(data.getHost())) {
            return null;
        }

        String apkUrl = data.getQueryParameter("url");
        if (apkUrl == null) return null;

        Uri parsedUrl = Uri.parse(apkUrl);
        if (!"https".equals(parsedUrl.getScheme())) return null;
        String host = parsedUrl.getHost();
        String path = parsedUrl.getPath();
        if (!"github.com".equals(host)
                || parsedUrl.getUserInfo() != null
                || parsedUrl.getPort() != -1
                || path == null
                || !path.startsWith("/Vetmaster/sporx-futbol-okulu/releases/download/")
                || !path.matches("/Vetmaster/sporx-futbol-okulu/releases/download/[^/]+/SASA-F-v[^/]+\\.apk")) return null;
        return apkUrl;
    }

    private void downloadUpdate(String apkUrl) {
        if (downloadStarted) return;
        downloadStarted = true;

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                File updateDirectory = new File(getCacheDir(), "updates");
                if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
                    throw new IllegalStateException("Güncelleme klasörü oluşturulamadı.");
                }

                downloadedApk = new File(updateDirectory, "sasa-f-update.apk");
                connection = (HttpURLConnection) new URL(apkUrl).openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();

                if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
                    throw new IllegalStateException("Sunucu yanıtı: " + connection.getResponseCode());
                }

                long contentLength = connection.getContentLengthLong();
                runOnUiThread(() -> progressBar.setIndeterminate(contentLength <= 0));

                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(downloadedApk)) {
                    byte[] buffer = new byte[16 * 1024];
                    long downloaded = 0;
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        downloaded += read;
                        if (contentLength > 0) {
                            int progress = (int) Math.min(100, downloaded * 100 / contentLength);
                            runOnUiThread(() -> progressBar.setProgress(progress));
                        }
                    }
                }

                runOnUiThread(this::installDownloadedUpdate);
            } catch (Exception error) {
                runOnUiThread(() -> showFailure("Güncelleme indirilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin."));
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private boolean canInstallPackages() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getPackageManager().canRequestPackageInstalls();
    }

    private void installDownloadedUpdate() {
        if (downloadedApk == null || !downloadedApk.exists()) return;

        if (!canInstallPackages()) {
            waitingForInstallPermission = true;
            statusText.setText("Kurulum izni bekleniyor…");
            Intent permissionIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName()));
            startActivity(permissionIntent);
            return;
        }

        statusText.setText("Kurulum hazırlanıyor…");
        progressBar.setIndeterminate(true);

        try {
            PackageInstaller packageInstaller = getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams parameters = new PackageInstaller.SessionParams(
                    PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            parameters.setAppPackageName(getPackageName());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                parameters.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
            }

            int sessionId = packageInstaller.createSession(parameters);
            try (PackageInstaller.Session session = packageInstaller.openSession(sessionId);
                 FileInputStream input = new FileInputStream(downloadedApk);
                 java.io.OutputStream output = session.openWrite("sasa-f-update.apk", 0, downloadedApk.length())) {
                byte[] buffer = new byte[16 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                session.fsync(output);

                Intent statusIntent = new Intent(this, UpdateInstallReceiver.class)
                        .setAction(UPDATE_ACTION);
                PendingIntent statusPendingIntent = PendingIntent.getBroadcast(
                        this,
                        sessionId,
                        statusIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
                session.commit(statusPendingIntent.getIntentSender());
            }
            statusText.setText("Android kurulum ekranı açılıyor…");
        } catch (Exception error) {
            if (!openSystemInstaller()) {
                showFailure("Kurulum başlatılamadı. Lütfen APK dosyasını indirip açın.");
            }
        }
    }

    private boolean openSystemInstaller() {
        if (downloadedApk == null || !downloadedApk.exists()) return false;

        try {
            Uri apkUri = FileProvider.getUriForFile(
                    this,
                    getString(R.string.providerAuthority),
                    downloadedApk);
            Intent installIntent = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(apkUri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(installIntent);
            statusText.setText("Android kurulum ekranı açılıyor…");
            return true;
        } catch (Exception fallbackError) {
            return false;
        }
    }

    private void showFailure(String message) {
        progressBar.setVisibility(ProgressBar.GONE);
        statusText.setText(message);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
}
