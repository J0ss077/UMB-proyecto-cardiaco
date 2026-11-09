// @requirement RF-04
import { beforeEach, describe, expect, it } from "vitest";
import { forgetAll, forgetDevice, loadDevices, mergePermitted, saveDevices, setLinked, upsertLinked } from "../lib/devices";

describe("known devices", () => {
    beforeEach(() => window.localStorage.clear());

    it("adds a chosen device as linked and does not duplicate it", () => {
        const once = upsertLinked([], { id: "d1", name: "Omron X-450" });
        const twice = upsertLinked(once, { id: "d1", name: "Omron X-450 nuevo" });

        expect(once).toEqual([{ id: "d1", name: "Omron X-450", linked: true }]);
        expect(twice).toEqual([{ id: "d1", name: "Omron X-450 nuevo", linked: true }]);
    });

    it("links and unlinks one device", () => {
        const list = [{ id: "d1", name: "A", linked: false }, { id: "d2", name: "B", linked: true }];
        expect(setLinked(list, "d1", true)[0]?.linked).toBe(true);
        expect(setLinked(list, "d2", false)[1]?.linked).toBe(false);
    });

    it("forgets one device or all of them", () => {
        const list = [{ id: "d1", name: "A", linked: true }, { id: "d2", name: "B", linked: true }];
        expect(forgetDevice(list, "d1")).toEqual([{ id: "d2", name: "B", linked: true }]);
        expect(forgetAll()).toEqual([]);
    });

    it("merges devices the browser already has permission for as available, keeping known ones", () => {
        const known = [{ id: "d1", name: "A", linked: true }];
        const merged = mergePermitted(known, [{ id: "d1", name: "A" }, { id: "d3", name: "C" }]);

        expect(merged).toEqual([
            { id: "d1", name: "A", linked: true },
            { id: "d3", name: "C", linked: false },
        ]);
    });

    it("gives a nameless device a readable name", () => {
        expect(upsertLinked([], { id: "d9" })[0]?.name).toBe("Dispositivo sin nombre");
    });

    it("round-trips and survives corrupt storage", () => {
        saveDevices([{ id: "d1", name: "A", linked: true }]);
        expect(loadDevices()).toEqual([{ id: "d1", name: "A", linked: true }]);

        window.localStorage.setItem("hta.devices.v1", "{broken");
        expect(loadDevices()).toEqual([]);
        window.localStorage.setItem("hta.devices.v1", JSON.stringify([{ id: 5 }, { id: "ok", name: "N", linked: true }]));
        expect(loadDevices()).toEqual([{ id: "ok", name: "N", linked: true }]);
    });
});
