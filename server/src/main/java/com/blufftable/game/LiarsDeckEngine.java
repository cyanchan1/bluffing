package com.blufftable.game;

import com.blufftable.domain.GameType;
import com.blufftable.service.RewardService;
import org.springframework.stereotype.Component;

@Component
public class LiarsDeckEngine extends AbstractLiarsDeckEngine {
    public LiarsDeckEngine(RewardService rewards) { super(rewards); }
    @Override public GameType type() { return GameType.LIARS_DECK; }
}
