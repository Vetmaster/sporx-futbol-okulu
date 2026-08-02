/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.sasafutbol.yonetim;

import android.Manifest;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.widget.ImageView;

import androidx.core.content.ContextCompat;
import androidx.core.app.ActivityCompat;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private static final long SPLASH_DISPLAY_DURATION_MILLIS = 3000L;
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 1201;
    private final Handler splashHandler = new Handler(Looper.getMainLooper());
    private final Runnable launchTwaTask = this::launchTwa;
    private long splashStartedAtMillis;
    private boolean twaLaunchScheduled;

    @Override
    protected boolean shouldLaunchImmediately() {
        return false;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        splashStartedAtMillis = SystemClock.elapsedRealtime();
        showSplashScreen();
        if (!requestNotificationPermissionIfNeeded()) scheduleTwaLaunch();
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    private boolean requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return false;
        ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                NOTIFICATION_PERMISSION_REQUEST_CODE);
        return true;
    }

    private void scheduleTwaLaunch() {
        if (twaLaunchScheduled) return;
        twaLaunchScheduled = true;
        long elapsedMillis = SystemClock.elapsedRealtime() - splashStartedAtMillis;
        long remainingMillis = Math.max(0L, SPLASH_DISPLAY_DURATION_MILLIS - elapsedMillis);
        splashHandler.postDelayed(launchTwaTask, remainingMillis);
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE) scheduleTwaLaunch();
    }

    private void showSplashScreen() {
        ImageView splashView = new ImageView(this);
        splashView.setBackgroundColor(ContextCompat.getColor(this, R.color.backgroundColor));
        splashView.setImageResource(R.drawable.splash);
        splashView.setScaleType(ImageView.ScaleType.CENTER);
        setContentView(
                splashView,
                new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
    }

    @Override
    protected void onDestroy() {
        splashHandler.removeCallbacks(launchTwaTask);
        super.onDestroy();
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri uri = super.getLaunchingUrl();
        Uri.Builder builder = uri.buildUpon().clearQuery();

        for (String parameterName : uri.getQueryParameterNames()) {
            if ("nativeVersion".equals(parameterName)) continue;
            for (String value : uri.getQueryParameters(parameterName)) {
                builder.appendQueryParameter(parameterName, value);
            }
        }

        builder.appendQueryParameter("nativeVersion", String.valueOf(getInstalledVersionCode()));
        builder.appendQueryParameter("androidShell", "1");
        return builder.build();
    }

    private long getInstalledVersionCode() {
        try {
            PackageInfo packageInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return packageInfo.getLongVersionCode();
            }
            return packageInfo.versionCode;
        } catch (PackageManager.NameNotFoundException error) {
            return 1L;
        }
    }
}
