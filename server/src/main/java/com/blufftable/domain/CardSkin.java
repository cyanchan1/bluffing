package com.blufftable.domain;

public enum CardSkin {
    CLASSIC("House deck", "Engraved gold", 0),
    AURORA("Aurora", "Liquid foil", 750),
    SUPERNOVA("Supernova", "Stellar fire", 1_750),
    PRISM("Prism", "Chromatic interference", 3_500);

    public final String label;
    public final String effect;
    public final long price;
    CardSkin(String label, String effect, long price) {
        this.label = label;
        this.effect = effect;
        this.price = price;
    }
}
