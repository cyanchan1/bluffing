package com.blufftable.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.blufftable.domain.*;
import com.blufftable.repository.RoomMembershipRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class RewardServiceTest {
    private final RoomMembershipRepository memberships = mock(RoomMembershipRepository.class);
    private final RewardService rewards = new RewardService(memberships);
    private final UUID roomId = UUID.randomUUID();
    private final UUID playerId = UUID.randomUUID();

    @ParameterizedTest
    @ValueSource(longs = {0, -1, Long.MIN_VALUE})
    void nonpositiveRewardsDoNotTouchBalances(long amount) {
        rewards.credit(roomId, playerId, amount);
        verifyNoInteractions(memberships);
    }

    @Test
    void creditLocksTheExactRoomMembership() {
        Player player = new Player(playerId, "Player");
        RoomMembership member = new RoomMembership(new Room(roomId, "Room", GameType.LIARS_DECK, player), player, 0);
        member.credit(100);
        when(memberships.findWithLockByRoomIdAndPlayerId(roomId, playerId)).thenReturn(Optional.of(member));
        rewards.credit(roomId, playerId, 40);
        assertThat(member.getBalance()).isEqualTo(140);
        verify(memberships).findWithLockByRoomIdAndPlayerId(roomId, playerId);
    }

    @Test
    void missingMembershipFailsInsteadOfSilentlyLosingTheReward() {
        assertThatThrownBy(() -> rewards.credit(roomId, playerId, 40))
            .isInstanceOf(IllegalStateException.class).hasMessage("Membership not found");
    }
}
