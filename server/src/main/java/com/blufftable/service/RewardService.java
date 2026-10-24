package com.blufftable.service;

import com.blufftable.repository.RoomMembershipRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RewardService {
    private final RoomMembershipRepository memberships;

    public RewardService(RoomMembershipRepository memberships) {
        this.memberships = memberships;
    }

    // Join the command transaction: payouts and recorded results commit together,
    // without a nested transaction trying to reacquire the parent's room lock.
    @Transactional
    public void credit(UUID roomId, UUID playerId, long amount) {
        if (amount <= 0) return;
        var membership = memberships.findWithLockByRoomIdAndPlayerId(roomId, playerId)
                .orElseThrow(() -> new IllegalStateException("Membership not found"));
        membership.credit(amount);
    }
}
