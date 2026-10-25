package com.blufftable.game;

import static org.assertj.core.api.Assertions.*;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

class LiarsDeckPlusRulesTest {
    private List<Card> cards(String ranks) {
        return Arrays.stream(ranks.split(" ")).map(rank -> new Card(UUID.randomUUID(), rank, "SPADES")).toList();
    }

    @ParameterizedTest
    @CsvSource({
        "JOKER,A,true", "JOKER,K,true", "JOKER JOKER,Q,true", "A JOKER,A,true", "A JOKER,K,false",
        "A A A A A,A,true", "A A A A A,2,false",
        "A 2 3 4,A,true", "A 2 3 4,2,true", "A 2 3 4,3,true", "A 2 3 4,4,true", "A 2 3 4,5,false",
        "2 3 4 5,2,true", "2 3 4 5,5,true", "2 3 4 5,A,false",
        "7 8 9 10,9,true", "10 J Q K,K,true", "J Q K A,A,true", "J Q K A,J,true", "J Q K A,2,false",
        "Q K A 2,A,false", "K A 2 3,A,false", "A 3 4 5,3,false", "2 2 3 4,2,false",
        "A 2 3 JOKER,4,true", "A 2 3 JOKER,5,false", "2 4 JOKER JOKER,A,true", "2 4 JOKER JOKER,5,true",
        "2 4 JOKER JOKER,6,false", "Q K A JOKER,J,true", "2 2 JOKER JOKER,2,true", "2 2 JOKER JOKER,3,false",
        "A 2 3,A,false", "A 2 3 4 5,3,false", "4 A 3 2,2,true", "JOKER,JOKER,false"
    })
    void checksRankMembershipWildcardsAndOnlyExactFourCardStraights(String cards, String rank, boolean expected) {
        assertThat(LiarsDeckPlusRules.isTruthful(cards(cards), rank)).isEqualTo(expected);
    }

    @Test void emptyClaimIsNeverTruthful() {
        assertThat(LiarsDeckPlusRules.isTruthful(List.of(), "A")).isFalse();
    }
}
