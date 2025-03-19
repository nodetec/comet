export function parseCouchDbUrl(urlString: string) {
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
}
