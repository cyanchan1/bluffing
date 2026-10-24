package com.blufftable.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RootAccessPolicyTest {
    private final RootAccessPolicy policy = new RootAccessPolicy();

    @Test
    void loopbackBrowserIsTheServerRunner() {
        assertThat(policy.isServerRunner("127.0.0.1", "http://127.0.0.1:5173", "local-server-runner", null)).isTrue();
        assertThat(policy.isServerRunner("0:0:0:0:0:0:0:1", "http://localhost:5173", "local-server-runner", null)).isTrue();
    }

    @Test
    void tailnetBrowserIsNotRoot() {
        assertThat(policy.isServerRunner("127.0.0.1", "https://table.example.ts.net", "local-server-runner", null)).isFalse();
        assertThat(policy.isServerRunner("127.0.0.1", "http://127.0.0.1:5173", null, null)).isFalse();
        assertThat(policy.isServerRunner("100.64.0.2", "http://127.0.0.1:5173", "local-server-runner", null)).isFalse();
        assertThat(policy.isServerRunner("127.0.0.1", "http://127.0.0.1:5173", "local-server-runner", "true")).isFalse();
    }
}
