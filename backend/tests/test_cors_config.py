import unittest

from app.cors import DEFAULT_CORS_ORIGINS, get_cors_origins, normalize_cors_origin

from tests.helpers import test_client


class CorsConfigTests(unittest.TestCase):
    def test_normalize_cors_origin_removes_whitespace_and_trailing_slashes(self) -> None:
        self.assertEqual(
            normalize_cors_origin(" https://frontend.example.com/// "),
            "https://frontend.example.com",
        )

    def test_get_cors_origins_uses_defaults_when_unset(self) -> None:
        self.assertEqual(get_cors_origins(""), list(DEFAULT_CORS_ORIGINS))

    def test_get_cors_origins_parses_comma_separated_render_origins(self) -> None:
        self.assertEqual(
            get_cors_origins(
                "https://frontend.example.com/, https://preview.example.com,, http://localhost:5173/",
            ),
            [
                "https://frontend.example.com",
                "https://preview.example.com",
                "http://localhost:5173",
            ],
        )

    def test_allowed_origin_receives_cors_header(self) -> None:
        response = test_client().get(
            "/api/sessions",
            headers={"Origin": "https://alphag3n-hackathon-2026-u87w.onrender.com"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "https://alphag3n-hackathon-2026-u87w.onrender.com",
        )
