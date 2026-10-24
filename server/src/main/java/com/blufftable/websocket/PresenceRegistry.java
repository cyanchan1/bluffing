package com.blufftable.websocket;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class PresenceRegistry {
    private final Map<String, UUID> playersBySession = new ConcurrentHashMap<>();
    private final Map<String, UUID> roomsBySession = new ConcurrentHashMap<>();

    public void authenticate(String sessionId, UUID playerId) {
        UUID previous = playersBySession.putIfAbsent(sessionId, playerId);
        if (previous != null && !previous.equals(playerId)) {
            throw new SecurityException("This connection is already authenticated");
        }
    }

    public Optional<UUID> player(String sessionId) {
        return Optional.ofNullable(playersBySession.get(sessionId));
    }

    public Optional<UUID> enterRoom(String sessionId, UUID roomId) {
        requireAuthenticated(sessionId);
        return Optional.ofNullable(roomsBySession.put(sessionId, roomId));
    }

    public Optional<UUID> leaveRoom(String sessionId) {
        return Optional.ofNullable(roomsBySession.remove(sessionId));
    }

    public PresenceChange disconnect(String sessionId) {
        return new PresenceChange(playersBySession.remove(sessionId), roomsBySession.remove(sessionId));
    }

    public boolean isOnline(UUID playerId) {
        return playersBySession.containsValue(playerId);
    }

    public boolean isInRoom(UUID playerId, UUID roomId) {
        return playersBySession.entrySet().stream().anyMatch(entry -> entry.getValue().equals(playerId)
                && roomId.equals(roomsBySession.get(entry.getKey())));
    }

    public int activePlayerCount(UUID roomId) {
        return (int) sessionIdsInRoom(roomId).stream()
                .map(playersBySession::get).filter(java.util.Objects::nonNull).distinct().count();
    }

    public Set<String> sessionIdsInRoom(UUID roomId) {
        return roomsBySession.entrySet().stream()
                .filter(entry -> roomId.equals(entry.getValue())).map(Map.Entry::getKey)
                .collect(Collectors.toUnmodifiableSet());
    }

    public Set<String> sessionIdsInRoom(UUID roomId, UUID playerId) {
        return sessionIdsInRoom(roomId).stream()
                .filter(sessionId -> playerId.equals(playersBySession.get(sessionId)))
                .collect(Collectors.toUnmodifiableSet());
    }

    private void requireAuthenticated(String sessionId) {
        if (!playersBySession.containsKey(sessionId)) throw new SecurityException("Authenticate this device first");
    }

    public record PresenceChange(UUID playerId, UUID roomId) {}
}
