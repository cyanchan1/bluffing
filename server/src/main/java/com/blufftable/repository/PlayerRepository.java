package com.blufftable.repository;

import com.blufftable.domain.Player;
import java.util.UUID;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlayerRepository extends JpaRepository<Player, UUID> {
    Optional<Player> findByDeviceTokenHash(String deviceTokenHash);
}
