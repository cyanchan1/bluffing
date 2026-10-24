package com.blufftable.websocket;

import static org.assertj.core.api.Assertions.*;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class PresenceRegistryTest {
    private final PresenceRegistry registry = new PresenceRegistry();
    private final UUID player = UUID.randomUUID();
    private final UUID room = UUID.randomUUID();

    @Test
    void unauthenticatedConnectionsCannotEnterRooms() {
        assertThatThrownBy(() -> registry.enterRoom("anonymous", room)).isInstanceOf(SecurityException.class);
        assertThat(registry.activePlayerCount(room)).isZero();
    }

    @Test
    void authenticatedConnectionCannotSwitchAccount() {
        registry.authenticate("tab", player);
        registry.authenticate("tab", player);
        assertThatThrownBy(() -> registry.authenticate("tab", UUID.randomUUID())).isInstanceOf(SecurityException.class);
        assertThat(registry.player("tab")).contains(player);
    }

    @Test
    void multipleTabsCountAsOneActivePlayerAndLastDisconnectGoesOffline() {
        registry.authenticate("one", player);
        registry.authenticate("two", player);
        registry.enterRoom("one", room);
        registry.enterRoom("two", room);
        assertThat(registry.activePlayerCount(room)).isEqualTo(1);
        assertThat(registry.sessionIdsInRoom(room, player)).containsExactlyInAnyOrder("one", "two");
        assertThat(registry.disconnect("one")).isEqualTo(new PresenceRegistry.PresenceChange(player, room));
        assertThat(registry.isOnline(player)).isTrue();
        assertThat(registry.isInRoom(player, room)).isTrue();
        registry.disconnect("two");
        assertThat(registry.isOnline(player)).isFalse();
        assertThat(registry.isInRoom(player, room)).isFalse();
        assertThat(registry.activePlayerCount(room)).isZero();
    }

    @Test
    void leavingTheRoomKeepsAccountOnlineButAway() {
        registry.authenticate("tab", player);
        registry.enterRoom("tab", room);
        assertThat(registry.leaveRoom("tab")).contains(room);
        assertThat(registry.isOnline(player)).isTrue();
        assertThat(registry.isInRoom(player, room)).isFalse();
        assertThat(registry.leaveRoom("tab")).isEmpty();
    }

    @Test
    void movingRoomsDoesNotLeakPresenceIntoThePreviousRoom() {
        UUID otherRoom = UUID.randomUUID();
        registry.authenticate("tab", player);
        assertThat(registry.enterRoom("tab", room)).isEmpty();
        assertThat(registry.enterRoom("tab", otherRoom)).contains(room);
        assertThat(registry.sessionIdsInRoom(room)).isEmpty();
        assertThat(registry.activePlayerCount(otherRoom)).isEqualTo(1);
    }

    @Test
    void duplicateOrUnknownDisconnectsAreHarmless() {
        assertThat(registry.disconnect("missing")).isEqualTo(new PresenceRegistry.PresenceChange(null, null));
        assertThat(registry.player("missing")).isEmpty();
    }
}
