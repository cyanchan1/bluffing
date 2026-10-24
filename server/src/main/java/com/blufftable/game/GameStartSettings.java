package com.blufftable.game;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record GameStartSettings(
        @Min(1) @Max(8) int deckCount,
        @Min(1) @Max(416) Integer cardsPerPlayer
) {}

