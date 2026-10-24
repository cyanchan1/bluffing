package com.blufftable.service;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class DeviceTokensTest {
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"short", "1234567890123456789012345678901"})
    void invalidCredentialsAreRejected(String token) {
        assertThatThrownBy(() -> DeviceTokens.hash(token)).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(ints = {32, 200})
    void boundaryLengthCredentialsProduceStableSha256Hashes(int length) {
        String token = "a".repeat(length);
        assertThat(DeviceTokens.hash(token)).matches("[0-9a-f]{64}").isEqualTo(DeviceTokens.hash(token)).isNotEqualTo(token);
    }

    @Test
    void overlongCredentialsAreRejected() {
        assertThatThrownBy(() -> DeviceTokens.hash("a".repeat(201))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void hashesHaveAKnownValueAndRemainCaseSensitive() {
        assertThat(DeviceTokens.hash("a".repeat(32))).isEqualTo("3ba3f5f43b92602683c19aee62a20342b084dd5971ddd33808d81a328879a547");
        assertThat(DeviceTokens.hash("A".repeat(32))).isNotEqualTo(DeviceTokens.hash("a".repeat(32)));
    }
}
