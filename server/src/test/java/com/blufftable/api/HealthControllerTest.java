package com.blufftable.api;

import org.junit.jupiter.api.Test;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HealthControllerTest {
    private final ApplicationAvailability availability = mock(ApplicationAvailability.class);
    private final HealthController controller = new HealthController(availability);

    @Test void startupAndShutdownMustNotPassTheLaunchersReadinessCheck() {
        when(availability.getReadinessState()).thenReturn(ReadinessState.REFUSING_TRAFFIC);
        var response = controller.health();
        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getBody()).containsEntry("status", "NOT_READY");
    }

    @Test void readyApplicationKeepsTheExistingHealthResponse() {
        when(availability.getReadinessState()).thenReturn(ReadinessState.ACCEPTING_TRAFFIC);
        var response = controller.health();
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).containsEntry("status", "UP");
    }
}
