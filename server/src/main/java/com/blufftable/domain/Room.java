package com.blufftable.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "rooms")
public class Room {
    @Id private UUID id;
    @Column(nullable = false, length = 40) private String name;
    @Enumerated(EnumType.STRING)
    @Column(name = "game_type", nullable = false, length = 32) private GameType gameType;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20) private RoomStatus status;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "host_id") private Player host;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Version private long version;
    @Column(name = "last_recorded_game_id") private UUID lastRecordedGameId;
    @Column(name = "last_notice", length = 160) private String lastNotice;

    protected Room() {}

    public Room(UUID id, String name, GameType gameType, Player host) {
        this.id = id;
        this.name = name;
        this.gameType = gameType;
        this.host = host;
        this.status = RoomStatus.LOBBY;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public GameType getGameType() { return gameType; }
    public RoomStatus getStatus() { return status; }
    public void setStatus(RoomStatus status) { this.status = status; }
    public Player getHost() { return host; }
    public void setHost(Player host) { this.host = host; }
    public UUID getLastRecordedGameId() { return lastRecordedGameId; }
    public void setLastRecordedGameId(UUID gameId) { lastRecordedGameId = gameId; }
    public String getLastNotice() { return lastNotice; }
    public void setLastNotice(String notice) { lastNotice = notice; }
    public Instant getCreatedAt() { return createdAt; }
}
