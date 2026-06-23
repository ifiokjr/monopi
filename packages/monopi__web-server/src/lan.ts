import { networkInterfaces } from "node:os";

export function getLanIp(): string | undefined {
	const interfaces = networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		const addrs = interfaces[name];

		if (!addrs) {
			continue;
		}

		for (const addr of addrs) {
			if (addr.family === "IPv4" && !addr.internal) {
				return addr.address;
			}
		}
	}
	return undefined;
}
