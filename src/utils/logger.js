import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'mcp-server' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Add a custom error logger
logger.error = (err) => {
    if (err instanceof Error) {
        logger.log({
            level: 'error',
            message: err.message,
            stack: err.stack,
            name: err.name,
            statusCode: err.statusCode || 500 // Custom errors might have statusCode
        });
    } else {
        logger.log({
            level: 'error',
            message: err
        });
    }
};

export default logger; 