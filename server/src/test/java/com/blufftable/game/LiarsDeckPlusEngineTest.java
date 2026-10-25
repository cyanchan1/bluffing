package com.blufftable.game;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.blufftable.domain.*;
import com.blufftable.service.RewardService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class LiarsDeckPlusEngineTest {
    private final UUID room = UUID.randomUUID(), one = UUID.randomUUID(), two = UUID.randomUUID();
    private final RewardService rewards = mock(RewardService.class);
    // No shuffle gives both players every natural rank and one joker; initial turn is still arbitrary.
    private final LiarsDeckPlusEngine engine = new LiarsDeckPlusEngine(rewards) {
        @Override protected void shuffleDeck(List<Card> deck) {}
    };

    private RoomMembership member(UUID id) {
        Player player = new Player(id, "Player");
        return new RoomMembership(new Room(room, "Room", GameType.LIARS_DECK_PLUS, player), player, 0);
    }
    private GameView view(UUID player) { return engine.view(room, player).orElseThrow(); }
    @BeforeEach void start() { engine.start(room, List.of(member(one), member(two)), new GameStartSettings(1, null)); }

    @ParameterizedTest @ValueSource(ints = {1, 2, 8})
    void everyDeckContainsExactlyTwoDistinctWildcardsAndAllNaturalCards(int decks) {
        List<Card> cards = engine.buildDeck(decks);
        assertThat(cards).hasSize(54 * decks);
        assertThat(cards.stream().map(Card::id).distinct().count()).isEqualTo(54L * decks);
        assertThat(cards.stream().filter(card -> card.rank().equals(Card.JOKER))).hasSize(2 * decks)
            .allMatch(card -> card.suit().equals(Card.JOKER));
        for (String rank : Card.RANKS) assertThat(cards.stream().filter(card -> card.rank().equals(rank))).hasSize(4 * decks);
    }

    @Test void autoHandSizeAccountsForJokersAndSnapshotsRemainPrivate() {
        assertThat(view(one).hand()).hasSize(27);
        assertThat(view(two).hand()).hasSize(27);
        assertThat(view(one).hand()).filteredOn(card -> card.rank().equals(Card.JOKER)).hasSize(1);
        assertThat(view(UUID.randomUUID()).hand()).isEmpty();
    }

    @ParameterizedTest @ValueSource(strings = {"A", "2", "3", "4"})
    void straightDefendsAnyMemberRankAndOnlyChallengerSeesTheCards(String rank) {
        UUID defender = view(one).currentPlayerId();
        List<UUID> ids = List.of("A", "2", "3", "4").stream()
            .map(value -> view(defender).hand().stream().filter(card -> card.rank().equals(value)).findFirst().orElseThrow().id()).toList();
        engine.command(defender, new GameCommand(room, GameAction.PLAY, ids, rank));
        UUID challenger = view(defender).currentPlayerId();
        engine.command(challenger, new GameCommand(room, GameAction.CHALLENGE, List.of(), null));
        assertThat(view(challenger).plays().getLast().status()).isEqualTo("TRUTH");
        assertThat(view(challenger).plays().getLast().revealedCards()).hasSize(4);
        assertThat(view(defender).plays().getLast().revealedCards()).isEmpty();
        assertThat(view(UUID.randomUUID()).outcomes().getLast().revealedCards()).isEmpty();
        assertThat(view(defender).currentPlayerId()).isEqualTo(defender);
        assertThat(view(challenger).hand()).hasSize(31);
        verify(rewards).credit(room, defender, 80);
    }

    @Test void jokerDefendsAnyRankWithoutRevealingItToTheDefenderOrSpectators() {
        UUID defender = view(one).currentPlayerId();
        Card joker = view(defender).hand().stream().filter(card -> card.rank().equals(Card.JOKER)).findFirst().orElseThrow();
        engine.command(defender, new GameCommand(room, GameAction.PLAY, List.of(joker.id()), "K"));
        UUID checker = view(defender).currentPlayerId();
        engine.command(checker, new GameCommand(room, GameAction.CHALLENGE, List.of(), null));
        assertThat(view(checker).plays().getLast().status()).isEqualTo("TRUTH");
        assertThat(view(checker).plays().getLast().revealedCards()).containsExactly(joker);
        assertThat(view(defender).plays().getLast().revealedCards()).isEmpty();
        verify(rewards).credit(room, defender, 20);
    }

    @Test void declaringOutsideStraightStillAllowsABluffButLosesTheCheck() {
        UUID defender = view(one).currentPlayerId();
        List<UUID> ids = List.of("A", "2", "3", "4").stream()
            .map(value -> view(defender).hand().stream().filter(card -> card.rank().equals(value)).findFirst().orElseThrow().id()).toList();
        engine.command(defender, new GameCommand(room, GameAction.PLAY, ids, "K"));
        UUID checker = view(defender).currentPlayerId();
        engine.command(checker, new GameCommand(room, GameAction.CHALLENGE, List.of(), null));
        assertThat(view(checker).plays().getLast().status()).isEqualTo("LIE");
        assertThat(view(defender).hand()).hasSize(27);
        verify(rewards).credit(room, checker, 80);
    }

    @Test void randomDecksStayWithinTheSeatedPlayerCountAndUseResolvedHandSizes() {
        for (int attempt = 0; attempt < 20; attempt++) {
            engine.start(room, List.of(member(one), member(two)), new GameStartSettings(0, null, true));
            assertThat(view(one).deckCount()).isBetween(1, 2);
            assertThat(view(one).hand()).hasSize(view(one).deckCount() * 27);
        }
    }

    @ParameterizedTest @ValueSource(ints = {1, 3})
    void randomRangeIncludesBothEndpoints(int decks) {
        LiarsDeckPlusEngine fixedRoll = new LiarsDeckPlusEngine(rewards) {
            @Override protected int randomDeckCount(int players) { assertThat(players).isEqualTo(3); return decks; }
        };
        fixedRoll.start(room, List.of(member(one), member(two), member(UUID.randomUUID())), new GameStartSettings(0, null, true));
        GameView game = fixedRoll.view(room, one).orElseThrow();
        assertThat(game.deckCount()).isEqualTo(decks);
        assertThat(game.cardsPerPlayer()).isEqualTo(decks * 18);
    }

    @Test void customRandomHandsMustFitEveryPossibleDraw() {
        assertThatThrownBy(() -> engine.start(room, List.of(member(one), member(two)), new GameStartSettings(1, 28, true)))
            .isInstanceOf(GameRuleException.class).hasMessageContaining("one deck");
        engine.start(room, List.of(member(one), member(two)), new GameStartSettings(1, 27, true));
        assertThat(view(one).hand()).hasSize(27);
    }

    @Test void classicAndPlusKeepSeparateSessionsEvenWithTheSameRoomId() {
        LiarsDeckEngine classic = new LiarsDeckEngine(rewards);
        classic.start(room, List.of(member(one), member(two)), new GameStartSettings(1, null));
        assertThat(classic.view(room, one).orElseThrow().hand()).hasSize(26);
        assertThat(classic.buildDeck(1)).noneMatch(card -> card.rank().equals(Card.JOKER));
        assertThat(classic.isTruthful(List.of(new Card(UUID.randomUUID(), "A", "SPADES"),
            new Card(UUID.randomUUID(), "2", "SPADES"), new Card(UUID.randomUUID(), "3", "SPADES"), new Card(UUID.randomUUID(), "4", "SPADES")), "A")).isFalse();
        assertThatThrownBy(() -> classic.start(room, List.of(member(one), member(two)), new GameStartSettings(1, null, true)))
            .isInstanceOf(GameRuleException.class);
        classic.remove(room);
        assertThat(view(one).hand()).hasSize(27);
    }
}
