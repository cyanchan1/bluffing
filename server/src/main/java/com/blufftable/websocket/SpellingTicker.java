package com.blufftable.websocket;

import com.blufftable.service.RoomService;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;

@Component
public class SpellingTicker {
    private final RoomService rooms;
    private final GameSocketHandler sockets;
    public SpellingTicker(RoomService rooms, GameSocketHandler sockets) { this.rooms = rooms; this.sockets = sockets; }
    @Scheduled(fixedDelay = 250)
    public void tick() { rooms.advanceTimedGames().forEach(sockets::broadcast); }
}
