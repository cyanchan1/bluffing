package com.blufftable.api;

import java.util.Map;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final ApplicationAvailability availability;

    public HealthController(ApplicationAvailability availability) {
        this.availability = availability;
    }

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, String>> health() {
        // Tomcat can accept requests before startup listeners finish recovering rooms.
        if (availability.getReadinessState() != ReadinessState.ACCEPTING_TRAFFIC) {
            return ResponseEntity.status(503).body(Map.of("status", "NOT_READY"));
        }
        return ResponseEntity.ok(Map.of("status", "UP"));
    }
}

