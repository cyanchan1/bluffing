package com.blufftable.service;

import com.blufftable.domain.Player;
import com.blufftable.repository.PlayerRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DeviceIdentityService {
    private static final String BEARER_PREFIX = "Bearer ";
    private final PlayerRepository players;

    public DeviceIdentityService(PlayerRepository players) { this.players = players; }

    @Transactional(readOnly = true)
    public Player authenticateAuthorization(String authorization) {
        if (authorization == null || !authorization.startsWith(BEARER_PREFIX)) {
            throw unauthorized();
        }
        return authenticateToken(authorization.substring(BEARER_PREFIX.length()));
    }

    @Transactional(readOnly = true)
    public Player authenticateToken(String token) {
        try {
            return players.findByDeviceTokenHash(DeviceTokens.hash(token)).orElseThrow(DeviceIdentityService::unauthorized);
        } catch (IllegalArgumentException exception) {
            throw unauthorized();
        }
    }

    private static ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "This device identity is not recognized");
    }
}
