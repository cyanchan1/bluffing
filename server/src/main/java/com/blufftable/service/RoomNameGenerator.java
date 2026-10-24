package com.blufftable.service;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

@Component
public class RoomNameGenerator {
    private static final String[] MOODS = {
            "Velvet", "Midnight", "Golden", "Lucky", "Quiet", "Scarlet", "Silver", "Secret"
    };
    private static final String[] PLACES = {
            "Casino", "Parlor", "Hideaway", "Penthouse", "Cabaret", "Saloon", "Lounge", "Club"
    };
    private final SecureRandom random = new SecureRandom();

    public String next() {
        return MOODS[random.nextInt(MOODS.length)] + " " + PLACES[random.nextInt(PLACES.length)];
    }
}
