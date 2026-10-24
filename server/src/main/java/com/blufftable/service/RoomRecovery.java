package com.blufftable.service;

import com.blufftable.domain.RoomStatus;
import com.blufftable.repository.RoomRepository;
import com.blufftable.repository.RoomMembershipRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class RoomRecovery {
    private final RoomRepository rooms;
    private final RoomMembershipRepository memberships;

    public RoomRecovery(RoomRepository rooms, RoomMembershipRepository memberships) {
        this.rooms = rooms;
        this.memberships = memberships;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void releaseRoomsFromInterruptedGames() {
        rooms.findAll().stream().filter(room -> room.getStatus() == RoomStatus.IN_GAME).forEach(room -> {
            memberships.findByRoomId(room.getId()).forEach(member -> member.restoreGameBalance());
            room.setStatus(RoomStatus.LOBBY);
            room.setLastNotice("Interrupted deal recovered. Every room wallet was restored to its pre-deal balance.");
        });
    }
}
