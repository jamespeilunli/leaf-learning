from __future__ import annotations

import hashlib
from collections.abc import AsyncGenerator

from app.models import ChatMessage, GraphEdge, GraphNode, Resource


Subject = dict[str, list[dict[str, str]]]


SUBJECT_FIXTURES: dict[str, Subject] = {
    "machine learning": {
        "children": [
            {
                "label": "Representation Learning",
                "description": "Representation learning studies how models transform raw inputs into useful internal features. It explains why embeddings and hidden layers can make downstream prediction easier.",
                "why_interesting": "It is the bridge between raw data and models that appear to understand structure.",
            },
            {
                "label": "Optimization for Neural Networks",
                "description": "Optimization covers how training algorithms adjust model parameters to reduce loss. It includes gradients, learning rates, curvature, and the failure modes that make training unstable.",
                "why_interesting": "Better optimization intuition makes model behavior feel less mysterious.",
            },
            {
                "label": "Generalization",
                "description": "Generalization is the question of why a model performs well on new data rather than only memorizing training examples. It connects dataset design, model capacity, regularization, and evaluation.",
                "why_interesting": "It is the core reason machine learning can be useful outside a benchmark.",
            },
            {
                "label": "Probabilistic Modeling",
                "description": "Probabilistic modeling represents uncertainty explicitly with distributions and likelihoods. It gives a language for reasoning about noisy observations and incomplete knowledge.",
                "why_interesting": "It helps explain confidence, calibration, and why some predictions should remain uncertain.",
            },
            {
                "label": "Evaluation and Metrics",
                "description": "Evaluation and metrics define how model quality is measured against a goal. This includes validation splits, precision-recall tradeoffs, calibration, and benchmark leakage.",
                "why_interesting": "A model is only as useful as the test that describes its real behavior.",
            },
        ]
    },
    "climate science": {
        "children": [
            {
                "label": "Radiative Forcing",
                "description": "Radiative forcing measures how changes in greenhouse gases, aerosols, or sunlight alter Earth's energy balance. It is a compact way to compare warming and cooling influences.",
                "why_interesting": "It connects physical causes directly to expected climate response.",
            },
            {
                "label": "Carbon Cycle Feedbacks",
                "description": "Carbon cycle feedbacks describe how oceans, forests, soils, and permafrost absorb or release carbon as climate changes. These feedbacks shape how long emissions affect temperature.",
                "why_interesting": "They explain why emissions today can influence climate for centuries.",
            },
            {
                "label": "Climate Models",
                "description": "Climate models simulate atmosphere, ocean, ice, and land interactions using physical equations. They are used to test scenarios and understand large-scale climate behavior.",
                "why_interesting": "They make global climate futures inspectable rather than purely speculative.",
            },
            {
                "label": "Extreme Event Attribution",
                "description": "Extreme event attribution estimates how climate change affects the likelihood or intensity of events like heat waves and floods. It compares observed events with modeled counterfactual worlds.",
                "why_interesting": "It links abstract climate trends to concrete events people experience.",
            },
        ]
    },
    "game design": {
        "children": [
            {
                "label": "Core Game Loops",
                "description": "Core game loops define the repeated actions and rewards that structure play. They determine what players spend most of their time doing and why it remains compelling.",
                "why_interesting": "A strong loop can make simple mechanics feel deep and durable.",
            },
            {
                "label": "Progression Systems",
                "description": "Progression systems manage how players gain abilities, unlock content, and perceive mastery over time. They balance pacing, motivation, and challenge escalation.",
                "why_interesting": "They shape whether players feel stuck, bored, or invested.",
            },
            {
                "label": "Level Design",
                "description": "Level design arranges spaces, encounters, information, and constraints into playable experiences. It guides attention while preserving meaningful choices.",
                "why_interesting": "It turns abstract mechanics into moments players can read and remember.",
            },
            {
                "label": "Player Psychology",
                "description": "Player psychology studies motivation, attention, frustration, flow, and decision making during play. It helps designers predict how mechanics will feel in practice.",
                "why_interesting": "It explains why technically fair systems can still feel unfair or boring.",
            },
        ]
    },
    "distributed systems": {
        "children": [
            {
                "label": "Consensus Protocols",
                "description": "Consensus protocols let multiple machines agree on state despite failures and delays. They are central to replicated databases, coordination services, and fault tolerance.",
                "why_interesting": "They show how reliable systems can be built from unreliable parts.",
            },
            {
                "label": "Replication",
                "description": "Replication keeps copies of data or services across machines to improve availability and durability. It introduces tradeoffs around consistency, lag, failover, and conflict handling.",
                "why_interesting": "It is the practical foundation of most highly available services.",
            },
            {
                "label": "Distributed Transactions",
                "description": "Distributed transactions coordinate changes that span multiple services or databases. They expose hard tradeoffs between atomicity, latency, and operational independence.",
                "why_interesting": "They explain why microservice data consistency is hard in real systems.",
            },
            {
                "label": "Observability",
                "description": "Observability uses logs, metrics, traces, and events to infer what distributed systems are doing. It is essential because failures often emerge from interactions across components.",
                "why_interesting": "It makes invisible cross-service behavior debuggable.",
            },
            {
                "label": "Backpressure and Load Shedding",
                "description": "Backpressure and load shedding control what happens when demand exceeds capacity. They help systems degrade intentionally instead of failing unpredictably.",
                "why_interesting": "They are how production systems survive overload.",
            },
        ]
    },
}


GENERIC_CHILDREN = [
    ("Foundations", "core ideas and terminology", "It gives later details a stable frame."),
    ("Mental Models", "conceptual explanations and analogies", "It makes the subject easier to reason about before adding precision."),
    ("Methods and Tools", "common techniques, workflows, and instruments", "It shows how the subject is practiced rather than only described."),
    ("Tradeoffs", "important choices, constraints, and failure modes", "It helps explain why experts disagree in realistic situations."),
    ("Case Studies", "concrete examples and applications", "It connects the topic to decisions and outcomes."),
]


DEEP_DIVE_FIXTURES: dict[str, dict[str, object]] = {
    "representation learning": {
        "resource": {
            "url": "https://example.com/mock/representation-learning",
            "title": "Mock Deep Dive: Representation Learning",
            "description": "A test resource that walks from embeddings to latent spaces and shows how learned features support downstream prediction.",
        },
        "prerequisites": [
            ("Vector Spaces", "A vector space lets embeddings be compared, combined, and transformed."),
            ("Loss Functions", "A loss function defines what kind of representation the model is rewarded for learning."),
            ("Gradient Descent", "Gradient descent is the update process that shapes representations during training."),
        ],
    },
    "optimization for neural networks": {
        "resource": {
            "url": "https://example.com/mock/neural-network-optimization",
            "title": "Mock Deep Dive: Neural Network Optimization",
            "description": "A test resource covering gradients, learning-rate schedules, momentum, and why training can stall or diverge.",
        },
        "prerequisites": [
            ("Derivatives", "Derivatives describe local change and are the basis for gradient-based updates."),
            ("Loss Functions", "The optimizer needs a scalar objective that says which parameter settings are better."),
            ("Matrix Multiplication", "Neural network layers and gradient calculations are usually expressed with matrices."),
        ],
    },
    "consensus protocols": {
        "resource": {
            "url": "https://example.com/mock/consensus-protocols",
            "title": "Mock Deep Dive: Consensus Protocols",
            "description": "A test resource explaining leader election, replicated logs, quorums, and failure handling in Raft-like systems.",
        },
        "prerequisites": [
            ("Quorums", "Quorums ensure that enough replicas overlap to preserve agreement."),
            ("Failure Models", "Failure models define which machine and network problems the protocol is expected to tolerate."),
            ("State Machines", "Replicated state machines are the structure consensus protocols keep synchronized."),
        ],
    },
    "radiative forcing": {
        "resource": {
            "url": "https://example.com/mock/radiative-forcing",
            "title": "Mock Deep Dive: Radiative Forcing",
            "description": "A test resource explaining Earth's energy budget, greenhouse gas absorption, aerosols, and forcing units.",
        },
        "prerequisites": [
            ("Energy Balance", "Energy balance compares incoming solar radiation with outgoing infrared radiation."),
            ("Blackbody Radiation", "Blackbody radiation explains why temperature affects emitted infrared energy."),
            ("Atmospheric Absorption", "Atmospheric absorption determines which wavelengths are trapped or transmitted."),
        ],
    },
    "core game loops": {
        "resource": {
            "url": "https://example.com/mock/core-game-loops",
            "title": "Mock Deep Dive: Core Game Loops",
            "description": "A test resource analyzing action-reward cycles, pacing, feedback, and how loops support long-term engagement.",
        },
        "prerequisites": [
            ("Feedback Loops", "Feedback loops connect player actions to visible consequences and future choices."),
            ("Player Motivation", "Player motivation explains why rewards and goals feel meaningful."),
            ("Difficulty Curves", "Difficulty curves control how challenge changes as player skill grows."),
        ],
    },
}


def _key(label: str) -> str:
    return " ".join(label.lower().strip().split())


def _stable_index(label: str, length: int) -> int:
    digest = hashlib.sha256(_key(label).encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % length


def _phase1_items(current_label: str, ancestor_labels: list[str]) -> list[dict[str, str]]:
    current_key = _key(current_label)
    ancestor_keys = {_key(label) for label in ancestor_labels}
    fixture = SUBJECT_FIXTURES.get(current_key)
    if fixture:
        items = fixture["children"]
    else:
        items = [
            {
                "label": f"{current_label} {suffix}",
                "description": f"This subtopic covers {focus} within {current_label}. It provides a useful testing branch with enough detail for selection and deep-dive flows.",
                "why_interesting": why,
            }
            for suffix, focus, why in GENERIC_CHILDREN
        ]

    return [item for item in items if _key(item["label"]) not in ancestor_keys][:6]


async def generate_phase1_children(
    current_label: str, ancestor_labels: list[str]
) -> AsyncGenerator[dict, None]:
    for item in _phase1_items(current_label, ancestor_labels):
        node = GraphNode(
            label=item["label"],
            description=item["description"],
            why_interesting=item["why_interesting"],
            phase="1",
            node_state="expanded",
        )
        yield {"event": "node_added", "data": node.model_dump(by_alias=True)}

    yield {"event": "stream_done", "data": {}}


def _generic_deep_dive(node_label: str) -> dict[str, object]:
    concepts = [
        ("Key Vocabulary", f"Key vocabulary defines the terms used by resources about {node_label}."),
        ("Worked Examples", f"Worked examples show how {node_label} appears in concrete situations."),
        ("Common Failure Modes", f"Common failure modes explain where misunderstandings around {node_label} usually happen."),
        ("Measurement Criteria", f"Measurement criteria describe how progress or quality is judged for {node_label}."),
    ]
    start = _stable_index(node_label, len(concepts))
    prerequisites = [concepts[(start + offset) % len(concepts)] for offset in range(3)]
    return {
        "sources": [
            {
                "url": f"https://example.com/mock/{_key(node_label).replace(' ', '-')}",
                "title": f"Mock Deep Dive: {node_label}",
                "description": f"A deterministic technical test resource for {node_label}, including examples, assumptions, and follow-on prerequisites.",
            },
            {
                "url": f"https://example.com/mock/{_key(node_label).replace(' ', '-')}-reference",
                "title": f"Technical Reference: {node_label}",
                "description": f"A secondary mock reference for definitions, assumptions, and terminology around {node_label}.",
            },
        ],
        "prerequisites": prerequisites,
    }


def _fixture_sources(fixture: dict[str, object], node_label: str) -> list[Resource]:
    if "sources" in fixture:
        return [Resource.model_validate(item) for item in fixture["sources"]]  # type: ignore[index]

    primary = Resource.model_validate(fixture["resource"])
    companion = Resource(
        url=f"https://example.com/mock/{_key(node_label).replace(' ', '-')}-companion",
        title=f"Companion Notes: {node_label}",
        description=f"A short companion reference with technical definitions and assumptions for {node_label}.",
    )
    return [primary, companion]


async def expand_phase2_node(
    node_label: str, known_topics: list[str], goal_label: str
) -> AsyncGenerator[dict, None]:
    fixture = DEEP_DIVE_FIXTURES.get(_key(node_label)) or _generic_deep_dive(node_label)

    sources = _fixture_sources(fixture, node_label)
    yield {
        "event": "node_updated",
        "data": {
            "sources": [source.model_dump() for source in sources],
        },
    }

    known = {_key(topic) for topic in known_topics}
    for label, hint in fixture["prerequisites"]:
        if _key(label) in known:
            continue
        node = GraphNode(label=label, description=hint, phase="2", node_state="grayed")
        yield {"event": "node_added", "data": node.model_dump(by_alias=True)}
        edge = GraphEdge(from_id=node_label, to_id=node.id, label="requires")
        yield {"event": "edge_added", "data": edge.model_dump(by_alias=True)}

    yield {"event": "stream_done", "data": {}}


async def explain_prerequisite(
    node_label: str, parent_label: str, parent_description: str
) -> str:
    return (
        f"{node_label} is a prerequisite for {parent_label} because the mock resource uses it "
        "as part of its technical explanation. It is the supporting idea that lets "
        f"the main topic make sense without skipping a hidden assumption. For testing, this "
        "text is deterministic and proves the explain-more flow works without calling OpenAI."
    )


async def suggest_prerequisite(
    user_message: str,
    parent_label: str,
    parent_description: str,
) -> dict[str, str]:
    label = " ".join(user_message.strip().split())[:80].strip(" ?.,")
    if not label:
        label = f"{parent_label} Supporting Concept"
    title = label.title()
    return {
        "label": title,
        "description": (
            f"{title} is a user-suggested prerequisite for {parent_label}; "
            "it captures a supporting concept that the generated roadmap did not include."
        ),
    }


async def chat_with_node(
    node_label: str,
    node_description: str,
    resource_description: str,
    goal_path: list[str],
    history: list[ChatMessage],
    user_message: str,
) -> AsyncGenerator[str, None]:
    response = (
        f"Mock tutor response for {node_label}: at the technical level, focus on how this "
        f"topic supports {' > '.join(goal_path)}. Your question was: {user_message.strip()} "
        "This confirms chat streaming works locally without an API key."
    )
    for word in response.split(" "):
        yield word + " "
