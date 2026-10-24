package com.blufftable.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class RoomMembershipTest {
    private RoomMembership membership() {
        Player player = new Player(UUID.randomUUID(), "Player");
        return new RoomMembership(new Room(UUID.randomUUID(), "Room", GameType.LIARS_DECK, player), player, 0);
    }

    @Test
    void abortedGameRestoresCheckpointExactlyOnce() {
        RoomMembership member = membership();
        member.credit(500);
        member.snapshotGameBalance();
        member.credit(150);
        member.restoreGameBalance();
        assertThat(member.getBalance()).isEqualTo(500);
        assertThat(member.getGameStartBalance()).isNull();
        member.credit(20);
        member.restoreGameBalance();
        assertThat(member.getBalance()).isEqualTo(520);
    }

    @Test
    void completedGameKeepsRewardsAndCannotBeRolledBackLater() {
        RoomMembership member = membership();
        member.credit(100);
        member.snapshotGameBalance();
        member.credit(50);
        member.commitGameBalance();
        member.restoreGameBalance();
        assertThat(member.getBalance()).isEqualTo(150);
        assertThat(member.getGameStartBalance()).isNull();
    }

    @Test
    void insufficientOrNegativeSpendsCannotChangeBalance() {
        RoomMembership member = membership();
        member.credit(100);
        assertThatThrownBy(() -> member.debit(101)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> member.debit(-1)).isInstanceOf(IllegalArgumentException.class);
        assertThat(member.getBalance()).isEqualTo(100);
        member.debit(100);
        assertThat(member.getBalance()).isZero();
    }

    @Test
    void overflowDoesNotWrapWalletIntoANegativeBalance() {
        RoomMembership member = membership();
        member.credit(Long.MAX_VALUE);
        assertThatThrownBy(() -> member.credit(1)).isInstanceOf(ArithmeticException.class);
        assertThat(member.getBalance()).isEqualTo(Long.MAX_VALUE);
    }

    @Test
    void lossResetsCurrentStreakButPreservesBestAndTotalWins() {
        RoomMembership member = membership();
        member.recordResult(true);
        member.recordResult(true);
        member.recordResult(false);
        member.recordResult(true);
        assertThat(member.getWins()).isEqualTo(3);
        assertThat(member.getCurrentStreak()).isEqualTo(1);
        assertThat(member.getBestStreak()).isEqualTo(2);
    }

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
