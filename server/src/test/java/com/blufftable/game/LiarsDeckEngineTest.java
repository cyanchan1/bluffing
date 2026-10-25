package com.blufftable.game;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.blufftable.domain.Player;
import com.blufftable.domain.RoomMembership;
import com.blufftable.service.RewardService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LiarsDeckEngineTest {
    private final UUID roomId = UUID.randomUUID();
    private final UUID one = UUID.randomUUID();
    private final UUID two = UUID.randomUUID();
    private RewardService rewards;
    private LiarsDeckEngine engine;

    @BeforeEach
    void setUp() {
        rewards = mock(RewardService.class);
        engine = new LiarsDeckEngine(rewards);
        engine.start(roomId, List.of(member(one), member(two)), new GameStartSettings(1, null));
    }

    @Test
    void caughtLieReturnsPoolToBlufferAndRewardsChallenger() {
        GameView initial = engine.view(roomId, one).orElseThrow();
        UUID first = initial.currentPlayerId();
        UUID second = first.equals(one) ? two : one;
        Card card = engine.view(roomId, first).orElseThrow().hand().getFirst();
        String falseRank = card.rank().equals("A") ? "K" : "A";

        engine.command(first, new GameCommand(roomId, GameAction.PLAY, List.of(card.id()), falseRank));
        engine.command(second, new GameCommand(roomId, GameAction.CHALLENGE, List.of(), null));

        GameView result = engine.view(roomId, first).orElseThrow();
        assertThat(result.poolSize()).isZero();
        assertThat(result.hand()).hasSize(26);
        assertThat(result.currentPlayerId()).isEqualTo(second);
        verify(rewards).credit(roomId, second, 20L);
    }

    @Test
    void completeFoldCycleVanishesPoolAndPaysClaimRisk() {
        GameView initial = engine.view(roomId, one).orElseThrow();
        UUID first = initial.currentPlayerId();
        UUID second = first.equals(one) ? two : one;
        Card card = engine.view(roomId, first).orElseThrow().hand().getFirst();

        engine.command(first, new GameCommand(roomId, GameAction.PLAY, List.of(card.id()), card.rank()));
        engine.command(second, new GameCommand(roomId, GameAction.FOLD, List.of(), null));
        engine.command(first, new GameCommand(roomId, GameAction.FOLD, List.of(), null));

        GameView result = engine.view(roomId, second).orElseThrow();
        assertThat(result.poolSize()).isZero();
        assertThat(result.targetRank()).isNull();
        assertThat(result.currentPlayerId()).isEqualTo(first);
        assertThat(result.initializerId()).isEqualTo(first);
        assertThat(result.plays()).isEmpty();
        playCard(first, view(first).hand().getFirst(), "K");
        assertThat(view(first).targetRank()).isEqualTo("K");
        assertThat(view(first).plays().getFirst().id()).isEqualTo(2);
        verify(rewards).credit(roomId, first, 10L);
    }

    private static RoomMembership member(UUID id) {
        RoomMembership membership = mock(RoomMembership.class);
        when(membership.getPlayer()).thenReturn(new Player(id, "Player"));
        return membership;
    }

    @Test
    void departureEndsTwoPlayerDealWithoutRewardAndCannotResumeIt() {
        engine.depart(roomId, one);
        var view = engine.view(roomId, two).orElseThrow();
        assertThat(view.phase()).isEqualTo("FINISHED");
        assertThat(view.winnerId()).isNull();
        assertThat(view.hands()).extracting(GameView.HandCount::playerId).containsExactly(two);
        assertThat(engine.view(roomId, one).orElseThrow().hand()).isEmpty();
        assertThatThrownBy(() -> engine.command(one, new GameCommand(roomId, GameAction.FOLD, List.of(), null)))
            .isInstanceOf(GameRuleException.class);
        verifyNoInteractions(rewards);
    }

    @Test
    void departureKeepsRemainingTurnOrderAndDiscardsUnresolvedPool() {
        UUID three = UUID.randomUUID();
        engine.start(roomId, List.of(member(one), member(two), member(three)), new GameStartSettings(1, 5));
        UUID first = engine.view(roomId, one).orElseThrow().currentPlayerId();
        Card card = engine.view(roomId, first).orElseThrow().hand().getFirst();
        engine.command(first, new GameCommand(roomId, GameAction.PLAY, List.of(card.id()), card.rank()));
        UUID next = engine.view(roomId, one).orElseThrow().currentPlayerId();
        engine.depart(roomId, first);
        GameView remaining = engine.view(roomId, next).orElseThrow();
        assertThat(remaining.phase()).isEqualTo("ACTIVE");
        assertThat(remaining.currentPlayerId()).isEqualTo(next);
        assertThat(remaining.initializerId()).isEqualTo(next);
        assertThat(remaining.hands()).hasSize(2);
        assertThat(remaining.poolSize()).isZero();
        assertThat(remaining.lastClaim()).isNull();
        Card nextCard = remaining.hand().getFirst();
        engine.command(next, new GameCommand(roomId, GameAction.PLAY, List.of(nextCard.id()), "A"));
        assertThat(engine.view(roomId, next).orElseThrow().poolSize()).isEqualTo(1);
        verifyNoInteractions(rewards);
    }

    @Test
    void departingCurrentPlayerAdvancesToNextSeat() {
        List<UUID> seats = List.of(one, two, UUID.randomUUID());
        engine.start(roomId, seats.stream().map(LiarsDeckEngineTest::member).toList(), new GameStartSettings(1, 5));
        GameView started = engine.view(roomId, one).orElseThrow();
        UUID current = started.currentPlayerId();
        List<UUID> gameOrder = started.hands().stream().map(GameView.HandCount::playerId).toList();
        UUID next = gameOrder.get((gameOrder.indexOf(current) + 1) % gameOrder.size());
        engine.depart(roomId, current);
        assertThat(engine.view(roomId, next).orElseThrow().currentPlayerId()).isEqualTo(next);
        engine.depart(roomId, current); // Duplicate socket close is harmless.
        assertThat(engine.view(roomId, next).orElseThrow().hands()).hasSize(2);
    }

    @Test
    void cannotTruthCheckYourOwnClaimAfterOthersFold() {
        UUID first = engine.view(roomId, one).orElseThrow().currentPlayerId();
        UUID second = first.equals(one) ? two : one;
        Card card = engine.view(roomId, first).orElseThrow().hand().getFirst();
        engine.command(first, new GameCommand(roomId, GameAction.PLAY, List.of(card.id()), card.rank()));
        engine.command(second, new GameCommand(roomId, GameAction.FOLD, List.of(), null));
        assertThatThrownBy(() -> engine.command(first, new GameCommand(roomId, GameAction.CHALLENGE, List.of(), null)))
            .isInstanceOf(GameRuleException.class).hasMessageContaining("own claim");
        verifyNoInteractions(rewards);
    }

    @Test
    void hugeHandSizeIsRejectedBeforeIntegerOverflow() {
        assertThatThrownBy(() -> engine.start(roomId, List.of(member(one), member(two)), new GameStartSettings(1, Integer.MAX_VALUE)))
            .isInstanceOf(GameRuleException.class);
    }

    @Test
    void playAndSingleFoldStayPendingWithoutPayoutOrRevealingCards() {
        UUID first = view(one).currentPlayerId();
        Card card = view(first).hand().getFirst();
        playCard(first, card, card.rank());
        var pending = view(first);
        assertThat(pending.pendingClaim().risk()).isEqualTo(10);
        assertThat(pending.earnings()).allMatch(entry -> entry.amount() == 0);
        assertThat(pending.outcomes()).isEmpty();
        engine.command(pending.currentPlayerId(), new GameCommand(roomId, GameAction.FOLD, List.of(), null));
        assertThat(view(first).pendingClaim().playerId()).isEqualTo(first);
        assertThat(view(first).outcomes()).isEmpty();
        verifyNoInteractions(rewards);
    }

    @Test
    void overplayedLieIsPaidImmediatelyAndNeverPaidAgainAfterPoolClears() {
        UUID first = view(one).currentPlayerId();
        Card card = view(first).hand().getFirst();
        playCard(first, card, card.rank().equals("A") ? "K" : "A");
        UUID second = view(first).currentPlayerId();
        playCard(second, view(second).hand().getFirst(), null);
        assertThat(earned(first)).isEqualTo(10);
        assertThat(earned(second)).isZero();
        assertThat(view(first).pendingClaim().playerId()).isEqualTo(second);
        var receipt = view(first).outcomes().getFirst();
        assertThat(receipt.type()).isEqualTo("PLAY_PASSED");
        assertThat(receipt.rewardPlayerId()).isEqualTo(first);
        assertThat(receipt.revealedCards()).isEmpty(); // A passed bluff stays secret.
        engine.command(first, new GameCommand(roomId, GameAction.FOLD, List.of(), null));
        engine.command(second, new GameCommand(roomId, GameAction.FOLD, List.of(), null));
        assertThat(view(first).pendingClaim()).isNull();
        assertThat(earned(second)).isEqualTo(20);
        assertThat(view(first).outcomes()).extracting(GameView.Outcome::id).containsExactly(1L, 2L);
        verify(rewards, times(1)).credit(roomId, first, 10);
        verify(rewards, times(1)).credit(roomId, second, 20);
        verifyNoMoreInteractions(rewards);
    }

    @Test
    void failedCheckPaysOnlyDefenderAndRevealsTruthOnlyToChallenger() {
        UUID first = view(one).currentPlayerId();
        Card card = view(first).hand().getFirst();
        playCard(first, card, card.rank());
        UUID challenger = view(first).currentPlayerId();
        engine.command(challenger, new GameCommand(roomId, GameAction.CHALLENGE, List.of(), null));
        var result = view(challenger);
        assertThat(result.pendingClaim()).isNull();
        assertThat(earned(challenger)).isZero();
        assertThat(earned(first)).isEqualTo(20);
        var receipt = result.outcomes().getLast();
        assertThat(receipt.type()).isEqualTo("CHECK_FAILED");
        assertThat(receipt.challengerId()).isEqualTo(challenger);
        assertThat(receipt.rewardPlayerId()).isEqualTo(first);
        assertThat(receipt.revealedCards()).containsExactly(card);
        assertThat(result.plays().getLast().revealedCards()).containsExactly(card);
        for (UUID viewer : List.of(first, UUID.randomUUID())) {
            assertThat(view(viewer).plays().getLast().revealedCards()).isEmpty();
            assertThat(view(viewer).outcomes().getLast().revealedCards()).isEmpty();
        }
        // Filtering another viewer's response must not erase the challenger's reveal.
        assertThat(view(challenger).plays().getLast().revealedCards()).containsExactly(card);
        assertThat(view(challenger).outcomes().getLast().revealedCards()).containsExactly(card);
        assertThat(receipt.declaredRank()).isEqualTo(card.rank());
        assertThat(result.hand()).hasSize(27);
        verify(rewards).credit(roomId, first, 20);
        verifyNoMoreInteractions(rewards);
    }

    @Test
    void catchingReplacementDoesNotCancelPreviouslySecuredReward() {
        UUID first = view(one).currentPlayerId();
        Card original = view(first).hand().getFirst();
        playCard(first, original, original.rank());
        UUID second = view(first).currentPlayerId();
        Card lie = view(second).hand().stream().filter(c -> !c.rank().equals(original.rank())).findFirst().orElseThrow();
        playCard(second, lie, null);
        engine.command(first, new GameCommand(roomId, GameAction.CHALLENGE, List.of(), null));
        assertThat(earned(first)).isEqualTo(50); // 10 passed + 2 * 20 successful check.
        assertThat(earned(second)).isZero();
        assertThat(view(first).pendingClaim()).isNull();
        var receipt = view(first).outcomes().getLast();
        assertThat(receipt.type()).isEqualTo("CHECK_SUCCEEDED");
        assertThat(receipt.poolSize()).isEqualTo(2);
        assertThat(receipt.revealedCards()).containsExactly(lie);
        assertThat(view(first).plays().getFirst().revealedCards()).isEmpty(); // Earlier unchecked play stays hidden.
        assertThat(view(first).plays().getLast().revealedCards()).containsExactly(lie);
        assertThat(view(second).plays().getLast().revealedCards()).isEmpty();
        assertThat(view(second).outcomes().getLast().revealedCards()).isEmpty();
        verify(rewards).credit(roomId, first, 10);
        verify(rewards).credit(roomId, first, 40);
        verifyNoMoreInteractions(rewards);
    }

    @Test
    void invalidReplacementDoesNotSecurePreviousClaim() {
        UUID first = view(one).currentPlayerId();
        playCard(first, view(first).hand().getFirst(), "A");
        UUID second = view(first).currentPlayerId();
        assertThatThrownBy(() -> playCard(second, view(second).hand().getFirst(), "K"))
            .isInstanceOf(GameRuleException.class);
        assertThat(view(first).pendingClaim().playerId()).isEqualTo(first);
        assertThat(view(first).outcomes()).isEmpty();
        verifyNoInteractions(rewards);
    }

    @Test
    void departureDiscardsOnlyPendingRewardAndKeepsEarnedGameWallet() {
        UUID first = view(one).currentPlayerId();
        playCard(first, view(first).hand().getFirst(), "A");
        UUID second = view(first).currentPlayerId();
        playCard(second, view(second).hand().getFirst(), null);
        engine.depart(roomId, second);
        assertThat(earned(first)).isEqualTo(10);
        assertThat(earned(second)).isZero();
        assertThat(view(first).pendingClaim()).isNull();
        assertThat(view(first).outcomes().getLast().type()).isEqualTo("PLAY_VOIDED");
        verify(rewards).credit(roomId, first, 10);
        verifyNoMoreInteractions(rewards);
    }

    @Test
    void finalPlayWaitsForAcceptanceBeforePayingAndNewDealResetsGameEarnings() {
        UUID first = view(one).currentPlayerId();
        engine.command(first, new GameCommand(roomId, GameAction.PLAY, view(first).hand().stream().map(Card::id).toList(), "A"));
        assertThat(view(first).phase()).isEqualTo("ACTIVE");
        assertThat(view(first).winnerId()).isNull();
        verifyNoInteractions(rewards);
        engine.command(view(first).currentPlayerId(), new GameCommand(roomId, GameAction.FOLD, List.of(), null));
        assertThat(view(first).winnerId()).isEqualTo(first);
        assertThat(earned(first)).isEqualTo(260 + 125);
        assertThat(view(first).pendingClaim()).isNull();
        assertThat(view(first).outcomes().getLast().type()).isEqualTo("GAME_WON");
        assertThat(view(first).outcomes().getLast().revealedCards()).isEmpty();
        verify(rewards).credit(roomId, first, 260);
        verify(rewards).credit(roomId, first, 125);
        engine.start(roomId, List.of(member(one), member(two)), new GameStartSettings(1, 3));
        assertThat(earned(first)).isZero();
        assertThat(view(first).outcomes()).isEmpty();
    }


    @Test
    void allCardsOpeningBluffCanBeCaughtAndDoesNotWin() {
        UUID first = view(one).currentPlayerId();
        var cards = view(first).hand();
        engine.command(first, new GameCommand(roomId, GameAction.PLAY, cards.stream().map(Card::id).toList(), "A"));
        UUID second = view(first).currentPlayerId();
        assertThat(view(second).plays().getLast().revealedCards()).isEmpty();
        engine.command(second, new GameCommand(roomId, GameAction.CHALLENGE, List.of(), null));
        assertThat(view(first).phase()).isEqualTo("ACTIVE");
        assertThat(view(first).winnerId()).isNull();
        assertThat(view(first).hand()).containsExactlyInAnyOrderElementsOf(cards);
        assertThat(view(first).currentPlayerId()).isEqualTo(second);
        assertThat(view(first).plays().getLast().status()).isEqualTo("LIE");
        for (UUID viewer : List.of(first, second, UUID.randomUUID())) {
            assertThat(view(viewer).plays().getLast().cardCount()).isEqualTo(cards.size());
            if (viewer.equals(second)) {
                assertThat(view(viewer).plays().getLast().revealedCards()).containsExactlyElementsOf(cards);
                assertThat(view(viewer).outcomes().getLast().revealedCards()).containsExactlyElementsOf(cards);
            } else {
                assertThat(view(viewer).plays().getLast().revealedCards()).isEmpty();
                assertThat(view(viewer).outcomes().getLast().revealedCards()).isEmpty();
            }
        }
        assertThat(earned(first)).isZero();
        verify(rewards).credit(roomId, second, 520);
        verifyNoMoreInteractions(rewards);
    }

    @Test
    void truthfulFinalHandIncludingWildcardWinsOnlyAfterCheck() {
        engine.start(roomId, List.of(member(one), member(two)), new GameStartSettings(1, 1));
        UUID first = view(one).currentPlayerId();
        Card card = view(first).hand().getFirst();
        engine.command(first, new GameCommand(roomId, GameAction.PLAY, view(first).hand().stream().map(Card::id).toList(), card.rank()));
        assertThat(view(first).phase()).isEqualTo("ACTIVE");
        engine.command(view(first).currentPlayerId(), new GameCommand(roomId, GameAction.CHALLENGE, List.of(), null));
        assertThat(view(first).winnerId()).isEqualTo(first);
        assertThat(earned(first)).isEqualTo(145);
        assertThat(view(first).plays().getLast().status()).isEqualTo("TRUTH");
        verify(rewards).credit(roomId, first, 20);
        verify(rewards).credit(roomId, first, 125);
        verifyNoMoreInteractions(rewards);
    }

    @Test
    void replacementAcceptsFinalHandWithoutRemovingRespondersCards() {
        UUID first = view(one).currentPlayerId();
        engine.command(first, new GameCommand(roomId, GameAction.PLAY, view(first).hand().stream().map(Card::id).toList(), "A"));
        UUID second = view(first).currentPlayerId();
        playCard(second, view(second).hand().getFirst(), null);
        assertThat(view(first).winnerId()).isEqualTo(first);
        assertThat(view(second).hand()).hasSize(26);
        assertThat(view(second).plays().getLast().status()).isEqualTo("PASSED");
        assertThat(view(second).plays().getLast().revealedCards()).isEmpty();
    }

    @Test
    void threePlayerFinalHandWaitsForEveryOpponentAndSurvivesDeparture() {
        UUID three = UUID.randomUUID();
        engine.start(roomId, List.of(member(one), member(two), member(three)), new GameStartSettings(1, 3));
        UUID first = view(one).currentPlayerId();
        engine.command(first, new GameCommand(roomId, GameAction.PLAY, view(first).hand().stream().map(Card::id).toList(), "A"));
        UUID second = view(first).currentPlayerId();
        engine.command(second, new GameCommand(roomId, GameAction.FOLD, List.of(), null));
        assertThat(view(first).winnerId()).isNull();
        engine.depart(roomId, second);
        assertThat(view(first).phase()).isEqualTo("ACTIVE");
        assertThat(view(first).hand()).hasSize(3);
        assertThat(view(first).plays().getLast().status()).isEqualTo("VOIDED");
        verifyNoInteractions(rewards);
    }

    @Test
    void threePlayerFoldCycleKeepsLastFolderAsInitializer() {
        UUID three = UUID.randomUUID();
        engine.start(roomId, List.of(member(one), member(two), member(three)), new GameStartSettings(1, 3));
        UUID first = view(one).currentPlayerId();
        playCard(first, view(first).hand().getFirst(), "A");
        for (int i = 0; i < 3; i++) engine.command(view(first).currentPlayerId(), new GameCommand(roomId, GameAction.FOLD, List.of(), null));
        assertThat(view(first).currentPlayerId()).isEqualTo(first);
        assertThat(view(first).initializerId()).isEqualTo(first);
        assertThat(view(first).poolSize()).isZero();
        assertThat(view(first).consecutiveFolds()).isZero();
        assertThat(view(first).plays()).isEmpty();
    }

    @Test
    void allFoldDiscardClearsCheckedHistoryForEveryoneAndNeverReusesPlayIds() {
        UUID first = view(one).currentPlayerId();
        Card checked = view(first).hand().getFirst();
        playCard(first, checked, checked.rank());
        UUID challenger = view(first).currentPlayerId();
        engine.command(challenger, new GameCommand(roomId, GameAction.CHALLENGE, List.of(), null));
        assertThat(view(challenger).poolSize()).isZero();
        assertThat(view(challenger).plays()).hasSize(1); // A check alone retains history.
        assertThat(view(challenger).plays().getLast().revealedCards()).containsExactly(checked);

        UUID initializer = view(first).currentPlayerId();
        playCard(initializer, view(initializer).hand().getFirst(), "A");
        long lastPlayId = view(first).plays().getLast().id();
        engine.command(view(first).currentPlayerId(), new GameCommand(roomId, GameAction.FOLD, List.of(), null));
        assertThat(view(first).plays()).hasSize(2); // A partial fold cycle retains history.
        engine.command(view(first).currentPlayerId(), new GameCommand(roomId, GameAction.FOLD, List.of(), null));
        for (UUID viewer : List.of(one, two, UUID.randomUUID())) {
            assertThat(view(viewer).plays()).isEmpty();
            assertThat(view(viewer).poolSize()).isZero();
        }
        UUID next = view(first).currentPlayerId();
        playCard(next, view(next).hand().getFirst(), "Q");
        assertThat(view(first).plays()).hasSize(1);
        assertThat(view(first).plays().getLast().id()).isEqualTo(lastPlayId + 1);
        assertThat(view(first).plays().getLast().revealedCards()).isEmpty();
    }

    private GameView view(UUID viewer) { return engine.view(roomId, viewer).orElseThrow(); }
    private long earned(UUID player) { return view(player).earnings().stream().filter(entry -> entry.playerId().equals(player)).findFirst().orElseThrow().amount(); }
    private void playCard(UUID player, Card card, String rank) {
        engine.command(player, new GameCommand(roomId, GameAction.PLAY, List.of(card.id()), rank));
    }
}
