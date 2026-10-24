package com.blufftable.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.blufftable.domain.Player;
import com.blufftable.repository.PlayerRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class DeviceIdentityServiceTest {
    private final PlayerRepository players = mock(PlayerRepository.class);
    private final DeviceIdentityService identities = new DeviceIdentityService(players);

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"Basic abc", "Bearer short", "Bearer ", "bearer abc"})
    void malformedAuthorizationIsUnauthorizedWithoutQueryingTheDatabase(String header) {
        assertThatThrownBy(() -> identities.authenticateAuthorization(header))
            .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
        verifyNoInteractions(players);
    }

    @Test
    void lookupUsesTheCredentialHashAndReturnsThePersistentPlayer() {
        String token = "device-credential-with-at-least-32-characters";
        Player player = new Player(UUID.randomUUID(), "Same nickname");
        when(players.findByDeviceTokenHash(DeviceTokens.hash(token))).thenReturn(Optional.of(player));
        assertThat(identities.authenticateAuthorization("Bearer " + token)).isSameAs(player);
        verify(players).findByDeviceTokenHash(DeviceTokens.hash(token));
        verifyNoMoreInteractions(players);
    }

    @Test
    void validButUnknownCredentialIsUnauthorized() {
        assertThatThrownBy(() -> identities.authenticateToken("a".repeat(32)))
            .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
    }
}
