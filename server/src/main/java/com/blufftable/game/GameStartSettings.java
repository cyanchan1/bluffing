package com.blufftable.game;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record GameStartSettings(
        @Min(1) @Max(8) int deckCount,
        @Min(1) @Max(432) Integer cardsPerPlayer,
        boolean randomDeckCount
) {
    public GameStartSettings(int deckCount, Integer cardsPerPlayer) { this(deckCount, cardsPerPlayer, false); }
}

