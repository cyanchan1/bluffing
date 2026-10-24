package com.blufftable.service;

import com.blufftable.api.ApiModels.PlayerRequest;
import com.blufftable.api.ApiModels.PlayerView;
import com.blufftable.api.ApiModels.RenamePlayerRequest;
import com.blufftable.domain.Player;
import com.blufftable.repository.PlayerRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlayerService {
    private final PlayerRepository players;

    public PlayerService(PlayerRepository players) { this.players = players; }

    @Transactional
    public PlayerView upsert(PlayerRequest request) {
        return upsert(request, false);
    }

    @Transactional
    public PlayerView upsert(PlayerRequest request, boolean grantRoot) {
        String name = request.displayName().trim();
        String tokenHash = DeviceTokens.hash(request.deviceToken());
        Player player = players.findByDeviceTokenHash(tokenHash).orElseGet(() -> claimLegacyOrCreate(request, name, tokenHash));
        if (grantRoot) player.grantRootAccess();
        players.save(player);
        return view(player);
    }

    @Transactional
    public PlayerView rename(Player player, RenamePlayerRequest request) {
        player.setDisplayName(request.displayName().trim());
        return view(players.save(player));
    }

    private Player claimLegacyOrCreate(PlayerRequest request, String name, String tokenHash) {
        if (request.legacyPlayerId() != null) {
            var legacy = players.findById(request.legacyPlayerId());
            if (legacy.isPresent() && legacy.get().getDeviceTokenHash() == null) {
                legacy.get().bindDeviceTokenHash(tokenHash);
                return legacy.get();
            }
        }
        return new Player(UUID.randomUUID(), name, tokenHash);
    }

    private static PlayerView view(Player player) {
        return new PlayerView(player.getId(), player.getDisplayName(), player.identityTag(), player.isRootAccount());
    }
}
