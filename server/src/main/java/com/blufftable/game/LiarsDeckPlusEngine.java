package com.blufftable.game;

import com.blufftable.domain.GameType;
import com.blufftable.service.RewardService;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class LiarsDeckPlusEngine extends AbstractLiarsDeckEngine {
    public LiarsDeckPlusEngine(RewardService rewards) { super(rewards); }

    @Override public GameType type() { return GameType.LIARS_DECK_PLUS; }
    @Override protected int cardsPerDeck() { return 54; }
    @Override protected boolean allowsRandomDecks() { return true; }
    @Override protected boolean isTruthful(List<Card> cards, String rank) {
        return LiarsDeckPlusRules.isTruthful(cards, rank);
    }
    @Override protected List<Card> buildDeck(int count) {
        List<Card> deck = super.buildDeck(count);
        for (int index = 0; index < count * 2; index++) deck.add(new Card(UUID.randomUUID(), Card.JOKER, Card.JOKER));
        return deck;
    }
}
