package com.blufftable.game;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

/** Pure verdict rules. Plays remain bluffable; truth is evaluated only on a check. */
final class LiarsDeckPlusRules {
    private LiarsDeckPlusRules() {}

    static boolean isTruthful(List<Card> cards, String declaredRank) {
        if (cards.isEmpty() || !Arrays.asList(Card.RANKS).contains(declaredRank)) return false;
        if (cards.stream().allMatch(card -> Card.JOKER.equals(card.rank()) || declaredRank.equals(card.rank()))) return true;
        if (cards.size() != 4) return false;
        List<String> natural = cards.stream().map(Card::rank).filter(rank -> !Card.JOKER.equals(rank)).toList();
        if (new HashSet<>(natural).size() != natural.size()) return false;
        // Ten ordinary windows A234..10JQK, then the ace-high window JQKA. No wrapping.
        for (int start = 0; start <= 10; start++) {
            List<String> straight = start == 10 ? List.of("J", "Q", "K", "A")
                    : Arrays.asList(Card.RANKS).subList(start, start + 4);
            if (straight.contains(declaredRank) && straight.containsAll(natural)) return true;
        }
        return false;
    }
}
