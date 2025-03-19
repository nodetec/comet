export function parseCouchDbUrl(urlString: string) {
  try {
    // Create a URL object from the input string
    const url = new URL(urlString);

    // Construct the URL without credentials using protocol, host, and pathname
    const urlWithoutCredentials = url.protocol + "//" + url.host + url.pathname;

    // Return an object with the URL, username, and password
    return {
      url: urlWithoutCredentials,
      username: url.username,
      password: url.password,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid CouchDB URL: ${error.message}`);
    } else {
      throw new Error("Invalid CouchDB URL: Unknown error");
    }
  }
}
