package com.blufftable;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling
public class BluffTableApplication {
    public static void main(String[] args) {
        SpringApplication.run(BluffTableApplication.class, args);
    }
}
