package com.blufftable.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

final class DeviceTokens {
    private DeviceTokens() {}

    static String hash(String token) {
        if (token == null || token.length() < 32 || token.length() > 200) {
            throw new IllegalArgumentException("Invalid device token");
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }
}

