"""
Các queue: recommendation, interaction, user, training
Các event handler: MovieEventHandler, InteractionEventHandler, UserEventHandler
Các exchange: recommendation.exchange, interaction.exchange, user.exchange, training.exchange. Hiện tại recommendation là sự kiện của movie
Các routing key tương ứng với event_type, format <scope | domain>.<action>:
 - movie.created, movie.updated, movie.deleted
 - user.updated.profile, user.deleted
 - interaction.created
 - training.request
Các DLX: recommendation.dlx, interaction.dlx, user.dlx, training.dlx
Cac DLQ: recommendation.dlq, interaction.dlq, user.dlq, training.dlq

"""

from attr import dataclass


@dataclass
class MessageEventType:
    # movie events
    MOVIE_CREATED = "movie.created"
    MOVIE_UPDATED = "movie.updated"
    MOVIE_DELETED = "movie.deleted"

    # user events
    USER_CREATED = "user.created"
    USER_UPDATED_PROFILE = "user.updated.profile"
    USER_DELETED = "user.deleted"

    # interaction events
    INTERACTION_CREATED = "interaction.created"

    # training events
    TRAINING_REQUEST = "training.request"


@dataclass
class MessageEventBus:
    """Theo các domain, mỗi domain gồm: queue, exchange, routing key, DLX, DLQ"""

    # movie events
    MOVIE_RECOMMENDATION_QUEUE = "movie.recommendation.queue"
    MOVIE_EXCHANGE = "movie.exchange"
    MOVIE_ROUTING_KEY = "movie.#"
    MOVIE_DLX = "recommendation.queue.dlx"
    MOVIE_DLQ = "recommendation.queue.dlq"
    MOVIE_DLQ_RK = "recommendation.queue.dlq.rk"

    # user events
    USER_RECOMMENDATION_QUEUE = "user.recommendation.queue"
    USER_EXCHANGE = "user.exchange"
    USER_ROUTING_KEY = "user.#"
    USER_DLX = "user.recommendation.queue.dlx"
    USER_DLQ = "user.recommendation.queue.dlq"
    USER_DLQ_RK = "user.recommendation.queue.dlq.rk"

    # interaction events
    INTERACTION_QUEUE = "interaction.queue"
    INTERACTION_EXCHANGE = "interaction.exchange"
    INTERACTION_BINDING_ROUTING_KEY = "interaction.#"
    INTERACTION_DLX = "interaction.queue.dlx"
    INTERACTION_DLQ = "interaction.queue.dlq"
    INTERACTION_DLQ_RK = "interaction.queue.dlq.rk"

    # training events: Hiện tại cùng chung queue với interaction,
    # TRAINING_QUEUE = "training.queue"
    # TRAINING_EXCHANGE = "training.exchange"
    TRAINING_BINDING_ROUTING_KEY = "training.#"
    # TRAINING_DLX = "training.dlx"
    # TRAINING_DLQ = "training.dlq"
