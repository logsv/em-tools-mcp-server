class CustomError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}

class NotFoundError extends CustomError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}

class AuthenticationError extends CustomError {
    constructor(message = 'Authentication failed') {
        super(message, 401);
    }
}

class ValidationError extends CustomError {
    constructor(message = 'Validation failed') {
        super(message, 400);
    }
}

export {
    CustomError,
    NotFoundError,
    AuthenticationError,
    ValidationError,
}; 