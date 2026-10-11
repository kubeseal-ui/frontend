# Use the official Node image to build the application
FROM node:26-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Account photos are opt-in (src/utils/avatar.ts): the image build is where a deployment turns them
# on, so an unset build arg is the initials mark and no external request.
ARG VITE_AVATAR_ENDPOINT=
ENV VITE_AVATAR_ENDPOINT=$VITE_AVATAR_ENDPOINT

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]