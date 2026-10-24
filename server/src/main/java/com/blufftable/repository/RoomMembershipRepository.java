package com.blufftable.repository;

import com.blufftable.domain.RoomMembership;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.EntityGraph;
import jakarta.persistence.LockModeType;

public interface RoomMembershipRepository extends JpaRepository<RoomMembership, UUID> {
    @EntityGraph(attributePaths = "player")
    List<RoomMembership> findByRoomIdAndActiveTrueOrderBySeatIndex(UUID roomId);
    @EntityGraph(attributePaths = "player")
    List<RoomMembership> findByRoomId(UUID roomId);
    Optional<RoomMembership> findByRoomIdAndPlayerId(UUID roomId, UUID playerId);
    boolean existsByRoomIdAndPlayerIdAndActiveTrue(UUID roomId, UUID playerId);
    long countByRoomIdAndActiveTrue(UUID roomId);

    @org.springframework.data.jpa.repository.Query("select membership.room.id from RoomMembership membership where membership.player.id = :playerId and membership.active = true")
    List<UUID> findActiveRoomIdsByPlayerId(UUID playerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select m from RoomMembership m where m.room.id = :roomId and m.player.id = :playerId")
    Optional<RoomMembership> findWithLockByRoomIdAndPlayerId(UUID roomId, UUID playerId);
}
