# nginx:alpine — server web ultra-lightweight (~7MB)
FROM nginx:alpine

# Directorul unde nginx serveste fisierele statice
WORKDIR /usr/share/nginx/html

# Sterge pagina default nginx
RUN rm -rf ./*

# Copiaza tot din src/ — game.html, css/ si js/ ajung toate in container
COPY src/ .

# Documenteaza portul pe care asculta aplicatia
EXPOSE 80

# Porneste nginx in foreground ca Docker sa il monitorizeze
CMD ["nginx", "-g", "daemon off;"]
