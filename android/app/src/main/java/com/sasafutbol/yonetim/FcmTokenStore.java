package com.sasafutbol.yonetim;

import android.content.Context;
import android.content.SharedPreferences;

final class FcmTokenStore {
    private static final String PREFERENCES = "sasa_f_fcm";
    private static final String TOKEN_KEY = "registration_token";

    private FcmTokenStore() {}

    static void save(Context context, String token) {
        if (token == null || token.trim().isEmpty()) return;
        preferences(context).edit().putString(TOKEN_KEY, token).apply();
    }

    static String get(Context context) {
        return preferences(context).getString(TOKEN_KEY, "");
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }
}
