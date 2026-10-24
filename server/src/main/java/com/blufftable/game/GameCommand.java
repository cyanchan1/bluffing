package com.blufftable.game;

import java.util.List;
import java.util.UUID;

public record GameCommand(
        UUID roomId,
        GameAction action,
        List<UUID> cardIds,
        String declaredRank
) {
    public GameCommand {
        cardIds = cardIds == null ? List.of() : List.copyOf(cardIds);
    }
}

