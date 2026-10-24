package com.blufftable.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class RoomMembershipTest {
    @Test
    void kickAndRejoinPreserveTheRoomBalance() {
        Player host = new Player(UUID.randomUUID(), "Host");
        Player guest = new Player(UUID.randomUUID(), "Guest");
        Room room = new Room(UUID.randomUUID(), "Test Room", GameType.LIARS_DECK, host);
        RoomMembership membership = new RoomMembership(room, guest, 1);
        membership.credit(140);

        membership.deactivate();
        membership.activate(3);

        assertThat(membership.isActive()).isTrue();
        assertThat(membership.getSeatIndex()).isEqualTo(3);
        assertThat(membership.getBalance()).isEqualTo(140);
    }
}
