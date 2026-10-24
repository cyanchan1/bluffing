package com.blufftable.api;

import com.blufftable.api.ApiModels.ErrorView;
import com.blufftable.game.GameRuleException;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(GameRuleException.class)
    public ResponseEntity<ErrorView> gameRule(GameRuleException exception) {
        return ResponseEntity.badRequest().body(new ErrorView(exception.getMessage()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorView> status(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).body(new ErrorView(exception.getReason()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorView> validation(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult().getFieldErrors().stream().findFirst()
                .map(error -> error.getField() + " " + error.getDefaultMessage()).orElse("Invalid request");
        return ResponseEntity.badRequest().body(new ErrorView(message));
    }
}
