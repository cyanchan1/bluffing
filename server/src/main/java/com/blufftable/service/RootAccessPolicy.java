package com.blufftable.service;

import java.net.URI;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class RootAccessPolicy {
    private static final Set<String> LOOPBACK_HOSTS = Set.of("localhost", "127.0.0.1", "::1", "[::1]");

    public boolean isServerRunner(String remoteAddress, String origin, String claim, String proxied) {
        if ("true".equalsIgnoreCase(proxied) || !"local-server-runner".equals(claim)
                || !isLoopback(remoteAddress) || origin == null) return false;
        try {
            return LOOPBACK_HOSTS.contains(URI.create(origin).getHost());
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private static boolean isLoopback(String address) {
        if (address == null) return false;
        String normalized = address.startsWith("/") ? address.substring(1) : address;
        return LOOPBACK_HOSTS.contains(normalized) || "0:0:0:0:0:0:0:1".equals(normalized);
    }
}
