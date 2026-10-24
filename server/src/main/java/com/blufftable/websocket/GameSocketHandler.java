package com.blufftable.websocket;

import com.blufftable.game.GameCommand;
import com.blufftable.service.DeviceIdentityService;
import com.blufftable.service.RoomService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.PongMessage;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class GameSocketHandler extends TextWebSocketHandler {
    private final RoomService rooms;
    private final ObjectMapper json;
    private final DeviceIdentityService identities;
    private final PresenceRegistry presence;
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, Long> lastSeen = new ConcurrentHashMap<>();

    public GameSocketHandler(RoomService rooms, ObjectMapper json, DeviceIdentityService identities,
                             PresenceRegistry presence) {
        this.rooms = rooms;
        this.json = json;
        this.identities = identities;
        this.presence = presence;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessions.put(session.getId(), session);
        lastSeen.put(session.getId(), System.currentTimeMillis());
        send(session, Map.of("type", "AUTH_REQUIRED", "payload", Map.of()));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        UUID playerId = presence.player(session.getId()).orElse(null);
        try {
            JsonNode root = json.readTree(message.getPayload());
            String type = root.path("type").asText();
            if ("AUTH".equals(type)) {
                authenticate(session, root.path("payload").path("deviceToken").asText());
            } else if (playerId == null) {
                throw new SecurityException("Authenticate this device before sending commands");
            } else if ("GAME_COMMAND".equals(type)) {
                GameCommand command = json.treeToValue(root.path("payload"), GameCommand.class);
                rooms.command(playerId, command);
                broadcast(command.roomId());
            } else if ("SYNC_ROOM".equals(type)) {
                UUID roomId = UUID.fromString(root.path("payload").path("roomId").asText());
                UUID previous;
                try { previous = rooms.enter(roomId, playerId, session.getId()); }
                catch (Exception denied) {
                    send(session, Map.of("type", "ROOM_REJECTED", "payload", Map.of("roomId", roomId,
                        "message", denied.getMessage() == null ? "Cannot enter this deal" : denied.getMessage())));
                    return;
                }
                if (previous != null && !previous.equals(roomId)) departed(previous, playerId);
                broadcast(roomId);
            } else if ("LEAVE_ROOM".equals(type)) {
                UUID leavingPlayer = playerId;
                presence.leaveRoom(session.getId()).ifPresent(room -> departed(room, leavingPlayer));
            } else {
                throw new IllegalArgumentException("Unknown message type");
            }
        } catch (Exception exception) {
            send(session, Map.of("type", "ERROR", "payload", Map.of("message",
                    exception.getMessage() == null ? "The command could not be completed" : exception.getMessage())));
        }
    }

    private void authenticate(WebSocketSession session, String deviceToken) throws IOException {
        UUID playerId = identities.authenticateToken(deviceToken).getId();
        presence.authenticate(session.getId(), playerId);
        send(session, Map.of("type", "CONNECTED", "payload", Map.of("playerId", playerId)));
        broadcastPlayerRooms(playerId);
    }

    public void broadcast(UUID roomId) {
        for (String sessionId : presence.sessionIdsInRoom(roomId)) {
            WebSocketSession session = sessions.get(sessionId);
            UUID playerId = presence.player(sessionId).orElse(null);
            if (session != null && session.isOpen() && playerId != null) {
                try { sendRoom(session, roomId, playerId); } catch (Exception ignored) { }
            }
        }
    }

    public void broadcastPlayerRooms(UUID playerId) {
        for (UUID roomId : rooms.roomIdsForPlayer(playerId)) broadcast(roomId);
    }

    public void kick(UUID roomId, UUID playerId) {
        for (String sessionId : presence.sessionIdsInRoom(roomId, playerId)) {
            WebSocketSession session = sessions.get(sessionId);
            if (session != null && session.isOpen()) {
                try { send(session, Map.of("type", "KICKED", "payload", Map.of("roomId", roomId))); }
                catch (IOException ignored) { }
            }
            presence.leaveRoom(sessionId);
        }
    }

    public void roomDeleted(UUID roomId) {
        for (String sessionId : presence.sessionIdsInRoom(roomId)) {
            WebSocketSession session = sessions.get(sessionId);
            if (session != null && session.isOpen()) {
                try { send(session, Map.of("type", "ROOM_DELETED", "payload", Map.of("roomId", roomId))); }
                catch (IOException ignored) { }
            }
            presence.leaveRoom(sessionId);
        }
    }

    private void sendRoom(WebSocketSession session, UUID roomId, UUID playerId) throws IOException {
        send(session, Map.of("type", "ROOM_STATE", "payload", rooms.view(roomId, playerId)));
    }

    private void send(WebSocketSession session, Object value) throws IOException {
        synchronized (session) {
            if (session.isOpen()) session.sendMessage(new TextMessage(json.writeValueAsString(value)));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        lastSeen.remove(session.getId());
        PresenceRegistry.PresenceChange change = presence.disconnect(session.getId());
        if (change.roomId() != null && change.playerId() != null) departed(change.roomId(), change.playerId());
        if (change.playerId() != null) broadcastPlayerRooms(change.playerId());
    }

    private void departed(UUID roomId, UUID playerId) {
        rooms.departed(roomId, playerId);
        broadcast(roomId);
    }

    @Override
    protected void handlePongMessage(WebSocketSession session, PongMessage message) {
        if (sessions.containsKey(session.getId())) lastSeen.put(session.getId(), System.currentTimeMillis());
    }

    @Scheduled(fixedDelay = 15000)
    public void heartbeat() {
        for (WebSocketSession session : sessions.values()) {
            try {
                if (System.currentTimeMillis() - lastSeen.getOrDefault(session.getId(), 0L) > 60000) {
                    // Remove presence immediately even when a broken transport cannot deliver a close frame.
                    afterConnectionClosed(session, CloseStatus.SESSION_NOT_RELIABLE);
                    session.close(CloseStatus.SESSION_NOT_RELIABLE);
                } else synchronized (session) {
                    if (session.isOpen()) session.sendMessage(new PingMessage());
                }
            } catch (Exception ignored) {
                afterConnectionClosed(session, CloseStatus.SESSION_NOT_RELIABLE);
                try { session.close(); } catch (IOException ignoredClose) { }
            }
        }
    }
}
