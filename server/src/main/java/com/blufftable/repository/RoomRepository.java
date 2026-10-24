package com.blufftable.repository;

import com.blufftable.domain.Room;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomRepository extends JpaRepository<Room, UUID> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    java.util.Optional<Room> findWithLockById(UUID id);
}
