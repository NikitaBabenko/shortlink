"""Verify OCI source and identity before registry login; never extract or run it."""

import hashlib
import json
import re
import sys
import tarfile
from pathlib import Path


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify(archive_path, metadata_path, index_path, sha):
    require(re.fullmatch(r"[0-9a-f]{40}", sha), "Expected a full source SHA")
    source = "https://github.com/NikitaBabenko/shortlink"
    inspected_index = json.loads(Path(index_path).read_bytes())
    expected = json.loads(Path(metadata_path).read_text())["containerimage.digest"]
    require(re.fullmatch(r"sha256:[0-9a-f]{64}", expected), "Invalid build digest")
    with tarfile.open(archive_path, "r:*") as archive:
        names = [member.name for member in archive.getmembers()]
        require(len(names) == len(set(names)), "Duplicate archive paths")

        def blob(digest):
            require(re.fullmatch(r"sha256:[0-9a-f]{64}", digest), "Invalid blob digest")
            stream = archive.extractfile("blobs/sha256/" + digest.split(":")[1])
            require(stream is not None, "Missing blob")
            content = stream.read()
            require("sha256:" + hashlib.sha256(content).hexdigest() == digest, "Blob hash mismatch")
            return content

        def document(descriptor):
            content = blob(descriptor["digest"])
            require(len(content) == descriptor["size"], "Blob size mismatch")
            return json.loads(content)

        layout = json.load(archive.extractfile("index.json"))
        require(len(layout["manifests"]) == 1, "Expected one exported image index")
        require(layout["manifests"][0]["digest"] == expected, "Exported index differs from build metadata")
        index = document(layout["manifests"][0])
        require(index == inspected_index, "Skopeo selected a different artifact")
        manifests = index["manifests"]
        images = [m for m in manifests if m.get("platform") == {"architecture": "amd64", "os": "linux"}]
        require(len(images) == 1, "Expected exactly one Linux amd64 image")
        image = images[0]
        attestations = [m for m in manifests if m.get("annotations", {}).get("vnd.docker.reference.type") == "attestation-manifest"]
        require(len(attestations) == 1 and len(manifests) == 2, "Expected one image and one attestation manifest")
        config = document(document(image)["config"])
        require(config["architecture"] == "amd64" and config["os"] == "linux", "Wrong image platform")
        settings = config["config"]
        labels = settings["Labels"]
        require(labels.get("org.opencontainers.image.source") == source, "Wrong source label")
        require(labels.get("org.opencontainers.image.revision") == sha, "Wrong revision label")
        require(settings.get("User") == "app", "Expected non-root app user")
        require(settings.get("Entrypoint") == ["/app/ai-shortlink"], "Wrong entrypoint")
        require({"VIBENEST_PILOT=true", "COOKIE_SECURE=true", "SETUP_BOOTSTRAP_USER=operator"}.issubset(set(settings.get("Env", []))), "Missing guarded defaults")
        provenance = []
        for descriptor in manifests:
            manifest = document(descriptor)
            document(manifest["config"])
            for layer in manifest["layers"]:
                content = blob(layer["digest"])
                require(len(content) == layer["size"], "Layer size mismatch")
                if layer["mediaType"] == "application/vnd.in-toto+json":
                    statement = json.loads(content)
                    if statement.get("predicateType") == "https://slsa.dev/provenance/v0.2":
                        provenance.append(statement)
        require(len(provenance) == 1, "Expected BuildKit SLSA v0.2 provenance")
        attestation = attestations[0]
        require(attestation["annotations"].get("vnd.docker.reference.digest") == image["digest"], "Attestation points to wrong image")
        statement = provenance[0]
        require(any(s.get("digest", {}).get("sha256") == image["digest"].split(":")[1] for s in statement["subject"]), "Provenance subject mismatch")
        predicate = statement["predicate"]
        require(any(m.get("uri", "").removeprefix("git+").split("#")[0] == source + ".git" and m.get("digest", {}).get("sha1") == sha for m in predicate["materials"]), "Source commit missing from provenance materials")
        require(predicate["invocation"]["configSource"]["entryPoint"] == "deploy/vibenest/Dockerfile", "Unexpected Dockerfile provenance")
        require("buildConfig" in predicate, "Expected max-mode build configuration provenance")
    return expected


if __name__ == "__main__":
    print(verify(*sys.argv[1:]))
